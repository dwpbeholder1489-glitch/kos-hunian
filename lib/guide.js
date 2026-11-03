// Isi tombol "? Panduan" di setiap menu aplikasi. step = nomor langkah di halaman /panduan
export const PAGE_HELP = {
  beranda: {
    title: 'Dashboard', step: 14,
    steps: ['Kas bersih = uang masuk − pengeluaran bulan ini.', 'Hunian menghitung kamar terisi dari kamar yang bisa disewakan.', 'Penghuni menunggak dan tagihan 7 hari ke depan tampil di bawah. Ketuk untuk menindaklanjuti.'],
    warn: ['Kas bersih bukan laba. Untuk laba yang benar lihat menu Laporan.'],
  },
  kamar: {
    title: 'Kamar', step: 3,
    steps: ['Ketuk kamar → Ubah data kamar untuk mengisi harga, fasilitas, dan status.', 'Ketuk kamar berstatus Tersedia → Isi kamar ini untuk memasukkan penghuni.', 'Tambah kamar baru dengan tombol + Kamar.'],
    warn: ['Status Terisi diatur otomatis oleh data sewa, tidak perlu diubah manual.', 'Kamar yang pernah disewa tidak bisa dihapus agar riwayatnya tetap ada.'],
  },
  penghuni: {
    title: 'Penghuni', step: 9,
    steps: ['Ketuk penghuni untuk melihat kamar, tagihan, dan tunggakannya.', 'Kirim pengingat via WhatsApp, atau kirim link Portal penghuni (Pro) agar penghuni bisa cek tagihan & kirim bukti sendiri.', 'Akhiri sewa saat penghuni keluar — kamar otomatis kembali tersedia.'],
    warn: ['Isi nomor WhatsApp agar tombol pengingat muncul. Isi email (atau biarkan penghuni mengisinya di portal) untuk pengingat otomatis.', 'Penghuni lama: isi "Tagihan pertama jatuh tempo" dengan jatuh tempo berikutnya yang belum dibayar.'],
  },
  tagihan: {
    title: 'Tagihan', step: 6,
    steps: ['Tagihan sewa terbit otomatis 7 hari sebelum jatuh tempo.', 'Ketuk tagihan → Catat pembayaran (boleh sebagian).', 'Biaya di luar sewa (listrik, laundry, denda): + Tagihan tambahan.'],
    warn: ['Catat pembayaran transfer/QRIS hanya setelah uang benar-benar masuk ke rekening.', 'Tagihan yang sudah punya pembayaran tidak bisa dibatalkan — batalkan pembayarannya dulu.'],
  },
  pembayaran: {
    title: 'Pembayaran', step: 8,
    steps: ['Pembayaran yang belum dicek muncul di "Menunggu verifikasi".', 'Cek mutasi rekening, lalu ketuk Uang sudah masuk atau Tolak.', 'Geser bulan dengan tombol ‹ › untuk melihat riwayat.'],
    warn: ['Membatalkan pembayaran membuat tagihannya kembali belum lunas.'],
  },
  pengeluaran: {
    title: 'Pengeluaran', step: 11,
    steps: ['Tab Biaya kos: + Catat, isi jumlah (boleh 350rb atau 1,2jt), tanggal, dan kategori — termasuk gaji pengelola/penjaga.', 'Tab Diambil pemilik & lainnya: uang kos yang dipakai pribadi (prive), setoran modal, pendapatan lain, dan pinjaman.', 'Ketuk catatan untuk mengubah atau menghapus. Kategori bisa ditambah di Pengaturan.'],
    warn: ['Catat semua uang keluar, sekecil apa pun, agar saldo kas cocok.', 'Uang yang diambil pemilik untuk pribadi bukan biaya kos — catat di tab kedua, bukan di Biaya kos.', 'Renovasi dan beli perabot pakai kategori jenis Modal — tidak mengurangi laba operasional.'],
  },
  laporan: {
    title: 'Laporan', step: 15,
    steps: ['Pilih bulan dengan tombol ‹ ›.', 'Baca Laba rugi: pendapatan − biaya operasional = laba operasional.', 'Paket Standar: tren 6 bulan, pendapatan per kamar, ekspor Excel, dan cetak PDF.'],
    warn: ['Laporan berbasis kas: pendapatan dihitung saat uang diterima, bukan saat ditagih.'],
  },
  langganan: {
    title: 'Langganan', step: 18,
    steps: ['Pilih paket dan durasi.', 'Bayar lewat QRIS atau transfer sesuai nominal.', 'Ketuk Saya sudah bayar, lalu kirim bukti via WhatsApp.'],
    warn: ['Paket aktif setelah pembayaran diperiksa, biasanya dalam 1×24 jam.'],
  },
  pengaturan: {
    title: 'Pengaturan', step: 19,
    steps: ['Ubah nama dan alamat kos (tercetak di kwitansi).', 'Tambah atau hapus kategori pengeluaran.', 'Tambah kos lain atau keluar dari akun.'],
    warn: [],
  },
};
