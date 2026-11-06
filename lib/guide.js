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
    steps: ['Ketuk penghuni untuk melihat kamar, tagihan, dan tunggakannya.', 'Kirim pengingat via WhatsApp, atau kirim link Portal penghuni (Pro) agar penghuni bisa cek tagihan & kirim bukti sendiri. Kata-kata pesannya bisa diubah lewat "Ubah teks pesan WhatsApp".', 'Akhiri sewa saat penghuni keluar — kamar otomatis kembali tersedia.'],
    warn: ['Isi nomor WhatsApp agar tombol pengingat muncul. Isi email (atau biarkan penghuni mengisinya di portal) untuk pengingat otomatis.', 'Penghuni lama: isi "Tagihan pertama jatuh tempo" dengan jatuh tempo berikutnya yang belum dibayar.'],
  },
  tagihan: {
    title: 'Tagihan', step: 6,
    steps: ['Tagihan sewa terbit otomatis 7 hari sebelum jatuh tempo.', 'Ketuk tagihan → Catat pembayaran (boleh sebagian).', 'Biaya di luar sewa (listrik, laundry, denda): + Tagihan tambahan.'],
    warn: ['Catat pembayaran transfer/QRIS hanya setelah uang benar-benar masuk ke rekening.', 'Tagihan yang sudah punya pembayaran tidak bisa dibatalkan — batalkan pembayarannya dulu.'],
  },
  pembayaran: {
    title: 'Pembayaran', step: 8,
    steps: ['Pembayaran yang belum dicek dan bukti dari portal penghuni (label "Dikirim penghuni") muncul di "Menunggu verifikasi".', 'Ketuk Lihat bukti, cocokkan dengan mutasi rekening, lalu ketuk Uang sudah masuk atau Tolak.', 'Geser bulan dengan tombol ‹ › untuk melihat riwayat.'],
    warn: ['Jangan menekan "Uang sudah masuk" hanya dari foto bukti — selalu cek mutasi rekening.', 'Membatalkan pembayaran membuat tagihannya kembali belum lunas.'],
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
    steps: ['Ubah nama dan alamat kos (tercetak di kwitansi).', 'Info untuk penghuni: WhatsApp, cara bayar, peraturan, plus pilihan email notifikasi bukti transfer dan daftar tagih setiap pagi. Unggah QRIS kos untuk portal.', 'Teks pesan WhatsApp: ubah kata-kata pesan pengingat dan link portal. Ketuk kata berwarna seperti {nama} atau {total} untuk menyisipkan data penghuni, cek Contoh pesan, lalu Simpan.', 'Atur kategori pengeluaran, tambah kos lain, atau keluar dari akun. Di bagian Akun, email arahan selama masa coba bisa dimatikan.', 'Toko: isi nama, alamat, No. WhatsApp toko, dan tulisan di bawah struk — pratinjau struk langsung terlihat.', 'Pengelola juga bisa mengubah pengaturan; pilihan email pemilik hanya bisa diubah pemilik.'],
    warn: ['Setelah mengganti QRIS, uji dengan satu pembayaran kecil.', 'Tombol "Kirim daftar tagih sekarang (uji)" hanya mengirim ke email Anda, tidak ke penghuni.'],
  },
  notifikasi: {
    title: 'Notifikasi', step: 23,
    steps: ['Lonceng di kanan atas menunjukkan jumlah hal yang perlu ditindaklanjuti hari ini: pembayaran menunggu diperiksa, tagihan telat, dan jatuh tempo hari ini.', 'Bagian Perlu perhatian: ketuk salah satu untuk langsung membuka menunya.', 'Pengaturan email: pilih laporan yang ingin diterima — daftar tagih harian, ringkasan mingguan (Senin), ringkasan bulanan (tanggal 1). Tekan Kirim contoh untuk mencoba.'],
    warn: ['Semua angka berasal dari data yang Anda catat. Catat pembayaran dan pengeluaran agar ringkasannya akurat.'],
  },
  bisnis: {
    title: 'Bisnis saya', step: 24,
    steps: ['Semua bisnis Anda dalam satu akun, dengan ringkasan bulan ini untuk masing-masing.', 'Ketuk salah satu bisnis untuk membukanya. Bisa juga lewat pilihan di kanan atas.', 'Tekan + Tambah bisnis, pilih jenisnya (Properti & Sewa atau Retail & Grosir), lalu isi nama.'],
    warn: ['Pembukuan tiap bisnis terpisah; angka tidak dicampur antar bisnis.'],
  },
  barang: {
    title: 'Barang & stok', step: 25,
    steps: ['Tekan + Tambah barang: isi nama, satuan terkecil (pcs/kg), harga modal, dan stok sekarang.', 'Isi harga eceran dan grosir. Tambah satuan lain seperti dus isi 40 atau renteng isi 10.', 'Tombol Stok: stok opname (isi jumlah fisik), barang rusak, kedaluwarsa, atau koreksi. Semua tercatat di riwayat.', 'Isi peringatan stok minimum agar barang muncul di daftar Menipis.'],
    warn: ['Harga modal dipakai untuk menghitung laba. Kalau kosong, laba barang itu terlihat terlalu tinggi.'],
  },
  kasir: {
    title: 'Kasir', step: 26,
    steps: ['Pilih Eceran atau Grosir di kanan atas.', 'Cari barang, ketuk tombol satuannya untuk memasukkan ke keranjang.', 'Ketuk bar Keranjang di bawah: atur jumlah/harga, diskon, lalu pilih Tunai, Transfer/QRIS, atau Kasbon.', 'Simpan, lalu cetak atau kirim struk lewat WhatsApp.'],
    warn: ['Kasbon wajib memilih nama pelanggan.', 'Tombol Simpan aman ditekan dua kali — transaksi tidak tercatat ganda.'],
  },
  penjualan: {
    title: 'Penjualan', step: 26,
    steps: ['Lihat transaksi per hari dengan tombol ‹ ›: omzet, laba kotor, dan kasbon.', 'Ketuk transaksi untuk melihat rincian, struk, atau membatalkannya.'],
    warn: ['Laba kotor = omzet − harga modal barang. Isi harga modal di Barang & stok agar akurat.'],
  },
  belanja: {
    title: 'Belanja', step: 27,
    steps: ['Tekan + Belanja, isi tanggal dan supplier.', 'Cari barang, ketuk untuk menambah. Pilih satuan (mis. dus), isi jumlah dan harga beli per satuan itu.', 'Pilih Tunai, Transfer, atau Utang ke supplier, lalu Simpan belanja.'],
    warn: ['Stok bertambah dan harga modal dihitung ulang (rata-rata) otomatis.', 'Barang belum datang? Pilih Pesan dulu, lalu Terima barang saat datang (boleh sebagian).', 'Barang baru ditambahkan dulu di Barang & stok.'],
  },
  kas: {
    title: 'Kas & kasbon', step: 29,
    steps: ['Pertama kali: + Uang masuk/keluar lain › Setor modal sebesar uang di laci (dan bank).', '+ Biaya untuk listrik, gaji, bensin, dll. Prive untuk uang yang diambil pribadi.', 'Tab Kasbon pelanggan: Terima bayar (boleh dicicil) atau Ingatkan WA.', 'Tab Utang supplier: Bayar saat melunasi belanja utang.'],
    warn: ['Saldo dihitung dari catatan. Kalau kas minus, berarti ada uang masuk (mis. modal awal) yang belum dicatat.', 'Prive tidak mengurangi laba, tetapi mengurangi kas.'],
  },
  'laporan-toko': {
    title: 'Laporan toko', step: 30,
    steps: ['Pilih bulan dengan ‹ ›.', 'Laba rugi: penjualan − modal barang − biaya − selisih stok = laba bersih.', 'Produk: Terlaris atau Paling untung. Tidak laku: barang berstok yang tidak terjual bulan itu.', 'Paket Standar: Unduh Excel dan Cetak / PDF.'],
    warn: ['Prive, setoran modal, dan belanja barang tidak dihitung sebagai laba atau biaya.'],
  },
  kontak: {
    title: 'Pelanggan & supplier', step: 32,
    steps: ['Pilih tab Pelanggan atau Supplier; cari dengan nama atau nomor.', 'Ketuk nama untuk melihat sisa kasbon/utang, riwayat transaksi, dan mengubah nama atau nomor WA.', 'Sisa kasbon: Terima bayar di Kas, atau Ingatkan WA.'],
    warn: ['Staf gudang hanya melihat supplier, tanpa saldo.'],
  },
  karyawan: {
    title: 'Karyawan', step: 31,
    steps: ['Isi email karyawan, pilih peran, lalu Undang.', 'Kirim cara masuk via WA: karyawan Daftar dengan email itu di halaman Masuk, lalu langsung bekerja di bisnis Anda.', 'Ubah peran, Nonaktifkan, atau Hapus dari daftar. Bersihkan = hapus semua email nonaktif & undangan kedaluwarsa.'],
    warn: ['Batas: Gratis 1, Standar 3, Pro tanpa batas. Undangan berlaku 14 hari.', 'Hak tiap peran diperiksa di database, bukan hanya disembunyikan dari menu.'],
  },
  // ---- Management Center (khusus staf PRASARA; tidak ada di panduan pelanggan) ----
  admin: {
    title: 'Dashboard bisnis', admin: true,
    steps: ['Angka dari database: bisnis terdaftar, berlangganan, MRR, pembayaran masuk, konversi, langganan habis.', 'Peringatan diurutkan per prioritas (Tinggi/Sedang/Rendah); ketuk Buka untuk menindaklanjuti.', 'Tindakan cepat membawa langsung ke daftar pelanggan yang perlu disapa atau verifikasi pembayaran.'],
    warn: ['Bisnis milik akun admin tidak dihitung.', 'Staf hanya melihat bagian sesuai perannya; izin diperiksa di database.'],
  },
  'admin-pelanggan': {
    title: 'Pelanggan', admin: true,
    steps: ['Cari nama bisnis atau email; saring per kondisi (skor rendah, coba hampir habis, tidak aktif) dan jenis bisnis.', 'Ketuk pelanggan untuk profil: skor kesehatan, alasan risiko, chat cepat, override akses, catatan internal, kronologi.', 'Override akses (tambah masa coba, beri paket, jadikan Gratis) wajib alasan dan tercatat di audit.', 'Akses bantuan: ringkasan angka lihat-saja, hanya bila pemilik memberi izin dari Pusat bantuan (24 jam). Setiap pembukaan terlihat oleh pemilik.', 'Tangguhkan akun (Super Admin) wajib alasan; data tidak dihapus dan bisa diaktifkan lagi.'],
    warn: ['Skor kesehatan versi awal: penggunaan laporan belum dilacak.', 'Data penghuni dan pelanggan toko tidak ditampilkan ke admin.'],
  },
  'admin-langganan': {
    title: 'Langganan & pembayaran', admin: true,
    steps: ['Tab Menunggu: cocokkan nominal dengan mutasi rekening/QRIS, lalu Uang masuk, aktifkan — atau Tolak.', 'Tab Riwayat untuk semua pembayaran; tab Langganan aktif diurutkan dari yang paling dulu berakhir.', 'Tab Perubahan paket: siapa mengubah paket siapa, sebelum → sesudah, dan alasannya.'],
    warn: ['Aktifkan hanya setelah uang benar-benar masuk.'],
  },
  'admin-tiket': {
    title: 'Tiket bantuan', admin: true,
    steps: ['Tab Perlu dibalas diurutkan dari prioritas tertinggi dan tiket terlama.', 'Buka tiket: pilih Balas pelanggan (juga dikirim ke email pemilik) atau Catatan internal (hanya tim).', 'Atur status, prioritas, dan penanggung jawab. Tandai Selesai bila masalah beres.'],
    warn: ['Jangan pernah meminta kata sandi pelanggan.', 'Waktu balas pertama dihitung otomatis dari balasan pertama ke pelanggan.'],
  },
  'admin-pengumuman': {
    title: 'Pengumuman', admin: true,
    steps: ['Pilih jenis: Layanan penting (pemeliharaan, perubahan) atau Info (fitur, tips).', 'Pilih sasaran paket & jenis bisnis; jumlah sasaran tampil otomatis.', 'Pilih saluran banner dan/atau email, cek pratinjau, lalu Terbitkan (ada konfirmasi).'],
    warn: ['Email info hanya ke yang tidak mematikan email PRASARA, maks 1 per 7 hari per bisnis.', 'Satu kiriman maksimal 250 email (kuota Gmail ±500/hari); sisanya kirim besok lewat Kirim sisa email.'],
  },
  'admin-staf': {
    title: 'Staf & hak akses', admin: true,
    steps: ['Tambahkan email staf dan pilih perannya (Support, Keuangan, dll.).', 'Staf membuka halaman PRASARA yang sama › Masuk › Daftar dengan email itu, lalu konfirmasi email.', 'Setelah masuk, staf yang tidak punya bisnis sendiri langsung dibawa ke Management Center — tidak perlu membuat bisnis.'],
    warn: ['Nonaktifkan staf yang sudah tidak bertugas; aksesnya langsung tertutup.'],
  },
  'admin-sistem': {
    title: 'Status sistem', admin: true,
    steps: ['Database, jadwal otomatis 07.00 WIB, dan jumlah email hari ini.', 'Daftar layanan hanya menunjukkan Terpasang/Belum — nilai kunci rahasia tidak pernah ditampilkan.', 'Riwayat jadwal: ✓/✗ untuk pengingat, pendampingan, dan ringkasan.'],
    warn: ['Bila jadwal "Periksa", buka Vercel › Logs untuk detail galat.'],
  },
};
