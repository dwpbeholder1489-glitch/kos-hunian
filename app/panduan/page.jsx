import Link from 'next/link';
import LandingNav from '@/components/LandingNav';
import { BUSINESS, SITE_HOST } from '@/lib/plan';
import {
  ScrSignup, ScrHelp, ScrRoomEdit, ScrStartLease, ScrRooms, ScrInvoices, ScrPay, ScrVerify, ScrReminder,
  ScrExtra, ScrExpense, ScrOwner, ScrEndLease, ScrDashboard, ScrReport, ScrExport, ScrReceipt, ScrPlan, ScrPortal,
} from '@/components/demo/Screens';

export const metadata = {
  title: 'Panduan PRASARA — Langkah demi Langkah',
  description: 'Panduan lengkap memakai PRASARA: kamar, penghuni, tagihan otomatis, pembayaran, pengeluaran, laporan, kwitansi, dan langganan.',
  openGraph: { title: 'Panduan PRASARA — Langkah demi Langkah', description: 'Cara memakai PRASARA dari daftar sampai laporan, lengkap dengan gambar.', url: '/panduan', images: [{ url: '/og.jpg', width: 1200, height: 630 }] },
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
  ['Kas & kasbon', 'Saldo kas/bank, biaya, kasbon pelanggan, utang'],
  ['Barang & stok', 'Barang, satuan, harga, barcode, label, tombol cepat'],
  ['Pelanggan & supplier', 'Kontak, sisa kasbon/utang, riwayat'],
  ['Laporan', 'Laba, barang terlaris dan tidak laku'],
];
const MENUS = [
  ['Dashboard', 'Ringkasan kas bulan ini, hunian, tagihan, tunggakan, dan jatuh tempo terdekat'],
  ['Kamar', 'Peta kamar, harga sewa, fasilitas, dan memasukkan penghuni'],
  ['Penghuni', 'Data penghuni, tunggakan, pengingat WhatsApp, dan akhiri sewa'],
  ['Tagihan', 'Tagihan sewa otomatis, tagihan tambahan, dan mencatat pembayaran'],
  ['Pembayaran', 'Memverifikasi pembayaran dan riwayat uang masuk per bulan'],
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
    ['Daftar dan buat kos', 'Halaman depan › Mulai Gratis 30 Hari', [
      <>Buka <b>{SITE_HOST}</b>, tekan <b>Mulai Gratis 30 Hari</b>, isi email dan kata sandi, lalu <b>Buat akun</b>.</>,
      <>Buka email Anda dan ketuk tautan konfirmasi.</>,
      <>Masuk, pilih jenis bisnis (kos = <b>Properti & Sewa</b>), lalu isi <b>Nama kos</b>, <b>Jumlah kamar</b>, dan <b>Awalan kode</b>.</>,
      <>Jawab beberapa pertanyaan singkat tentang usaha Anda (boleh dilewati), tinjau <b>modul yang disarankan</b> beserta alasannya, lalu tekan <b>Setujui & buat bisnis</b>. Kamar A01, A02, … dibuat otomatis.</>,
    ], 'Tidak menerima email konfirmasi? Periksa folder Spam atau Promosi.', null, <ScrSignup />],
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
      <>Isi <b>Tagihan pertama jatuh tempo</b>, lalu tekan <b>Mulai sewa</b>.</>,
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
      <>Isi <b>Tanggal bayar</b> dan <b>Metode</b>: tunai, transfer, atau QRIS.</>,
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
      <>Isi <b>Tanggal keluar</b> dan alasan bila perlu.</>,
      <>Tekan <b>Akhiri sewa</b>. Kamar kembali <b>Tersedia</b>.</>,
      <>Tagihan bulan berikutnya yang belum dibayar dibatalkan otomatis. Tunggakan lama tetap tercatat.</>,
    ], null, null, <ScrEndLease />],
  ]],
  ['C', 'Pengecekan', [
    ['Pantau kondisi kos di Dashboard', 'Dashboard', [
      <><b>Kas bersih</b> = uang masuk − pengeluaran bulan ini.</>,
      <><b>Hunian</b> = kamar terisi dibanding kamar yang bisa disewakan.</>,
      <><b>Tunggakan</b> dan daftar <b>penghuni menunggak</b> untuk ditindaklanjuti.</>,
    ], 'Kas bersih bukan laba. Untuk laba yang benar, lihat Laporan.', null, <ScrDashboard />],
    ['Laporan bulanan', 'Laporan', [
      <>Pilih bulan dengan tombol <b>‹ ›</b>.</>,
      <><b>Laba operasional</b> = pendapatan − biaya operasional.</>,
      <><b>Arus kas bersih</b> = laba − belanja modal − pengeluaran non-operasional.</>,
      <>Tren 6 bulan dan pendapatan per kamar <Std /></>,
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
      <>Pasang di layar utama HP: Safari › <b>Bagikan</b> › <b>Tambah ke Layar Utama</b>; Chrome › <b>⋮</b> › <b>Tambahkan ke layar utama</b>.</>,
    ], null, null, null],
    ['Portal penghuni & asisten 24 jam', 'Penghuni › ketuk penghuni › Portal penghuni', [
      <>Isi dulu <b>Info untuk penghuni</b> di Pengaturan: nomor WhatsApp pengelola, <b>cara bayar</b>, <b>peraturan kos</b>, dan unggah <b>QRIS kos</b> agar penghuni bisa langsung scan.</>,
      <>Buka penghuni, tekan <b>Kirim link via WhatsApp</b>. Penghuni menerima link pribadi tanpa perlu daftar. Kata-kata pesannya bisa diubah di <b>Pengaturan › Teks pesan WhatsApp</b>; link selalu ikut terkirim.</>,
      <>Penghuni bisa melihat tagihan, <b>mengirim bukti transfer</b>, dan <b>bertanya ke asisten</b> soal tagihan, cara bayar, dan peraturan.</>,
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
    ['Banyak bisnis & Ringkasan pemilik', 'Lainnya › Ringkasan pemilik', [
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
      <>Di <b>Satuan jual & harga</b>, isi harga eceran dan grosir. Tekan <b>+ Tambah satuan</b> untuk dus/pak/renteng beserta isinya (mis. dus isi 40).</>,
      <>Untuk menghitung ulang atau mencatat barang rusak, tekan <b>Stok</b> di samping barang, pilih alasannya, isi jumlah, lalu <b>Simpan</b>.</>,
      <>Opsional: isi <b>Kode barang</b> dan <b>Barcode</b> tiap satuan (angka di bawah garis-garis kemasan). Di Kasir, scan barcode atau ketik kodenya lalu Enter — barang langsung masuk keranjang.</>,
    ], <>Scanner barcode Bluetooth/USB bekerja di iPhone maupun Android. Tombol kamera 📷 Pindai bisa dipakai di iPhone dan Android (izinkan akses kamera). Stok tidak bisa diketik langsung — setiap perubahan tercatat di <b>Riwayat stok</b> agar selisihnya bisa ditelusuri. Muncul tanda merah jika harga eceran di bawah modal.</>, null, null],
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
    ['Pusat konfigurasi', 'Lainnya › Konfigurasi (pemilik & pengelola)', [
      <>Tab <b>Modul</b>: lihat modul aktif, yang bisa diaktifkan, dan yang segera hadir. Ketuk modul untuk melihat fungsinya, menu, data yang dipakai, modul yang dibutuhkan, dan paketnya.</>,
      <>Tekan <b>Aktifkan</b> atau <b>Nonaktifkan</b> (wajib alasan). Modul nonaktif: menunya hilang dan pemakaiannya ditolak server, tetapi <b>data lama tidak dihapus</b>.</>,
      <>Pengelola hanya bisa <b>meminta</b>; pemilik menyetujui di tab <b>Persetujuan</b>.</>,
      <>Tab <b>Profil</b>: kelompok bisnis, karakteristik usaha, dan <b>badan usaha</b> (perorangan, CV, PT…). Tab <b>Cabang & gudang</b>: daftar lokasi (khusus pemilik).</>,
      <>Tab <b>Riwayat</b>: semua perubahan — siapa, kapan, alasan, dan tingkat risikonya.</>,
    ], <>Modul inti (mis. Kasir, Barang, Tagihan) selalu aktif. Modul yang masih punya transaksi terbuka (shift belum ditutup, pesanan belum diterima) tidak bisa dinonaktifkan sebelum diselesaikan. Cabang & gudang saat ini dicatat sebagai struktur; stok per cabang segera hadir.</>, null, null],
    ['Persetujuan', 'Lainnya › Persetujuan', [
      <>Tindakan berisiko oleh karyawan — mis. <b>membatalkan penjualan</b>, <b>membatalkan belanja</b>, <b>membatalkan pelunasan</b>, <b>menghapus kontak</b>, <b>mengubah modul</b> — tidak langsung jalan. Karyawan menekan tombolnya, menulis alasan, lalu permintaan masuk ke sini.</>,
      <>Kasir bisa <b>meminta pembatalan</b> atau <b>meminta retur</b> untuk penjualannya sendiri dari menu Penjualan.</>,
      <>Pemilik membuka permintaan: terlihat <b>nomor</b>, siapa yang meminta, alasan, <b>data terdampak</b>, dan <b>estimasi nilai</b>. Tekan <b>Setujui & jalankan</b> atau <b>Tolak</b>.</>,
      <>Setelah disetujui, sistem langsung menjalankan tindakannya dan mencatat hasilnya (berhasil atau gagal beserta sebabnya) di <b>Riwayat</b>.</>,
      <>Tab <b>Aturan</b> (pemilik): pilih tindakan mana yang wajib disetujui.</>,
    ], <>Pemilik selalu bisa langsung menjalankan tindakan tanpa persetujuan. Aturan bawaan: pembatalan penjualan/belanja/pelunasan, hapus kontak, dan ubah modul wajib disetujui; retur dan penyesuaian stok tidak.</>, null, null],
    ['Otomatisasi', 'Lainnya › Otomatisasi (pemilik)', [
      <>Pilih resep, baca <b>pemicu → syarat → tindakan</b>-nya, lalu tekan <b>Nyalakan</b>. Semua resep berjalan setiap pagi pukul 07.00.</>,
      <>Toko: <b>stok menipis → draf pesanan</b> ke supplier terakhir (menunggu persetujuan Anda), <b>kasbon jatuh tempo</b>, <b>utang supplier jatuh tempo</b>, <b>shift lupa ditutup</b>. Kos: <b>pembayaran menunggu diperiksa</b>, <b>tagihan telat</b>. Semua: <b>ringkasan awal bulan</b>.</>,
      <>Hasilnya muncul di <b>Pemberitahuan</b> (dan email untuk resep tertentu). Tekan <b>Jalankan sekarang</b> untuk mencoba.</>,
      <>Buka <b>Riwayat jalan</b> untuk melihat kapan berjalan, hasilnya, atau kesalahannya.</>,
    ], <>Otomatisasi tidak pernah mengubah data sendiri: tindakan yang mengubah data (mis. membuat pesanan) masuk ke Persetujuan. Paling banyak sekali sehari, tidak membuat pesanan ganda, dan dijeda otomatis setelah 3 kali gagal. WhatsApp otomatis belum tersedia — pesan WA disiapkan untuk dikirim dengan satu ketukan.</>, null, null],
    ['Pembukuan', 'Lainnya › Pembukuan (pemilik & pengelola)', [
      <>Tidak perlu mencatat dua kali: setiap penjualan, retur, belanja, kas, kasbon/utang, perubahan stok, pengeluaran, dan pembayaran sewa yang terverifikasi otomatis menjadi <b>jurnal</b> (debit & kredit seimbang). Jurnal diposting saat halaman dibuka dan setiap pagi.</>,
      <>Tab <b>Laporan</b>: <b>Laba rugi</b> (pendapatan, HPP, beban) untuk bulan terpilih atau sejak awal tahun, dan <b>Neraca</b> (aset = kewajiban + ekuitas) per akhir bulan. Kotak di atasnya menunjukkan cakupan, waktu dibuat, basis pencatatan, dan status <b>Lengkap/Belum lengkap</b> beserta sebabnya.</>,
      <>Toko: <b>Cek kecocokan</b> membandingkan saldo buku dengan menu Kas, kasbon, utang, dan nilai stok. Selisih ditampilkan, tidak diubah diam-diam.</>,
      <>Tab <b>Buku besar</b>: pilih akun (mis. Kas) untuk melihat setiap mutasi dan saldonya; ketuk <b>lihat …</b> untuk membuka transaksi asalnya. Tab <b>Jurnal</b>: semua jurnal beserta baris debit/kreditnya.</>,
      <>Punya beberapa bisnis dalam satu badan usaha (atur di Konfigurasi › Profil)? Pilih <b>Seluruh badan usaha</b> untuk laporan gabungan bisnis-bisnis itu. Badan usaha berbeda tidak pernah digabung.</>,
      <>Tab <b>Periode & manual</b> (pemilik): <b>Tutup</b> bulan yang sudah diperiksa (alasan wajib, tercatat). <b>Jurnal manual</b> untuk penyesuaian, mis. saldo awal rekening bank: debit Bank, kredit Ekuitas saldo awal.</>,
    ], <>Jurnal tidak bisa dihapus atau diubah. Bila penjualan/belanja dibatalkan atau diubah, sistem membuat <b>jurnal pembalikan/koreksi</b>; untuk bulan yang sudah ditutup, koreksinya dicatat di bulan berjalan. Kos dicatat saat uang diterima (basis kas), toko saat transaksi terjadi — gabungan berbeda basis hanya indikasi, bukan konsolidasi resmi. Pajak & penyusutan otomatis belum tersedia.</>, null, null],
    ['Stok per lokasi & mutasi', 'Konfigurasi › Cabang & gudang, lalu menu Mutasi stok (toko)', [
      <>Pemilik membuka <b>Lainnya › Mutasi stok</b> › <b>+ Tambah gudang / cabang</b> (atau Konfigurasi › Cabang & gudang › + Tambah). Lokasi yang sudah ada otomatis bernama <b>Lokasi utama</b> (boleh diganti namanya) dan semua stok lama ada di sana.</>,
      <>Begitu ada lebih dari satu lokasi, muncul kotak <b>📍 Lokasi kerja</b> di Kasir, Barang & stok, dan Belanja. Pilih lokasi tempat Anda bekerja: penjualan, belanja, hitung ulang stok, dan barang rusak tercatat di lokasi itu.</>,
      <>Barang & stok menampilkan stok <b>di sini</b> dan <b>total</b>; tombol <b>Stok</b> menunjukkan rincian per lokasi.</>,
      <>Memindahkan barang (mis. gudang → toko): buka <b>Mutasi stok</b>, pilih <b>Dari</b> dan <b>Ke</b>, cari barang, isi jumlah, lalu <b>Pindahkan</b>. Riwayat mutasi mencatat nomor, asal–tujuan, waktu, dan siapa.</>,
      <>Pemilik bisa menetapkan lokasi kerja tiap karyawan di menu <b>Karyawan</b>; karyawan itu tidak bisa pindah lokasi sendiri dan hanya bisa mengirim barang dari lokasinya. Laporan toko menampilkan penjualan <b>per lokasi</b>.</>,
    ], <>Mutasi tidak mengubah total stok maupun harga modal. Stok yang dimutasi tidak boleh melebihi stok di lokasi asal. Lokasi yang masih ada stoknya tidak bisa dinonaktifkan. Kas, biaya, pengingat stok minimum, dan pembukuan tetap dihitung untuk seluruh bisnis (belum per lokasi).</>, null, null],
    ['Saran untuk bisnis Anda', 'Konfigurasi › Saran (pemilik & pengelola)', [
      <>Bila ada saran, di dashboard Toko/Dashboard kos muncul kotak <b>💡 N saran</b>. Ketuk untuk membuka <b>Konfigurasi › Saran</b>.</>,
      <>Setiap saran menyebut <b>alasan</b> dengan angka dari data Anda (mis. "7 penjualan kasbon dalam 30 hari terakhir"), <b>manfaat</b>, <b>dampak</b>, dan <b>tingkat risiko</b>.</>,
      <>Tekan <b>Terapkan</b> untuk menjalankannya (mengaktifkan modul, menyalakan otomatisasi, atau mewajibkan persetujuan), atau <b>Buka</b> untuk saran yang Anda kerjakan sendiri (mis. melengkapi harga modal, menutup buku).</>,
      <>Tidak cocok? Tekan <b>Abaikan 30 hari</b> (alasan opsional). Semua keputusan tercatat di Riwayat.</>,
    ], <>Saran hanya muncul bila datanya cukup kuat (mis. minimal beberapa kejadian dalam 30 hari), bukan dari satu kejadian. Tidak ada yang berubah sebelum Anda menekan Terapkan. Pengelola yang menerapkan saran modul akan mengirim permintaan ke pemilik. Saran ini dihitung dengan aturan tetap — bukan AI.</>, null, null],
    ['Unduh semua data & tutup bisnis', 'Pengaturan › Data & penutupan bisnis (pemilik)', [
      <>Tekan <b>Unduh semua data (.zip)</b>. File berisi satu CSV per tabel (dibuka di Excel, Numbers, atau Google Sheets) dan data.json untuk arsip. Di iPhone, file tersimpan di app <b>Files › Unduhan</b>.</>,
      <>Usaha berhenti? Tekan <b>Tutup bisnis…</b>. Sistem memeriksa: shift yang belum ditutup, pesanan supplier yang belum selesai, persetujuan menunggu, pembayaran belum diverifikasi, penghuni aktif, dan <b>ekspor data dalam 7 hari terakhir</b> — semuanya harus beres dulu.</>,
      <>Baca bagian <b>Perlu diketahui</b> (sisa kasbon/utang/tagihan, stok, periode buku, karyawan aktif) lalu centang <b>Saya mengerti</b>.</>,
      <>Ketik nama bisnis persis sama, tulis alasan, lalu tekan <b>Tutup bisnis</b>.</>,
      <>Bisnis yang ditutup menampilkan pita merah di semua halaman. Pemilik bisa menekan <b>Buka kembali</b> kapan saja (alasan wajib).</>,
    ], <>Menutup bisnis tidak menghapus data apa pun: transaksi, laporan, dan pembukuan tetap bisa dilihat dan diunduh. Selama ditutup, semua orang (termasuk pemilik) tidak bisa mencatat apa pun, otomatisasi dimatikan, dan email harian/ringkasan untuk bisnis itu berhenti. Foto bukti transfer tidak ikut dalam file .zip.</>, null, null],
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
        <p className="muted" style={{ margin: 0 }}>Langkah demi langkah memakai PRASARA untuk kos (kamar, penghuni, tagihan, pembayaran, laporan) dan toko (kasir, stok, belanja, kas, laporan), termasuk karyawan.</p>

        <h2 style={{ color: 'var(--brand-2)' }}>Cara berpindah menu</h2>
        <ul style={{ margin: 0, paddingLeft: 22, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <li>Di HP, <b>4 menu utama ada di bawah layar</b>. Menu lain ada di <b>Lainnya</b> (•••), bersama Bantuan, pilihan <b>Tampilan</b> (Ikuti HP / Terang / Gelap), dan Keluar.</li>
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

        <h2 style={{ color: 'var(--brand-2)' }}>Urutan panduan</h2>
        <div className="g-order">
          <div><b>Persiapan</b><span><a href="#bagian-A">Langkah 1–5</a><br />Daftar, kamar, penghuni</span></div>
          <div><b>Setiap bulan</b><span><a href="#bagian-B">Langkah 6–13</a><br />Tagihan, bayar, pengingat, biaya</span></div>
          <div><b>Pengecekan</b><span><a href="#bagian-C">Langkah 14–17</a><br />Dashboard, laporan, kwitansi</span></div>
          <div><b>Akun & otomatis</b><span><a href="#bagian-D">Langkah 18–24</a><br />Langganan, portal, pengingat</span></div>
          <div><b>Toko</b><span><a href="#bagian-E">Langkah 25–30</a><br />Barang, kasir, belanja, kas, laporan</span></div>
          <div><b>Karyawan & lainnya</b><span><a href="#bagian-F">Langkah 31–42</a><br />Karyawan, kontak, shift, label, konfigurasi, persetujuan, otomatisasi, pembukuan, lokasi, saran, ekspor & tutup bisnis</span></div>
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
