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
    steps: ['Pilih paket dan durasi (harga per bisnis per bulan).', 'Bayar lewat QRIS atau transfer sesuai nominal.', 'Ketuk Saya sudah bayar, lalu kirim bukti via WhatsApp. Nomor invoice muncul di Riwayat tagihan — ketuk untuk melihat/cetak.', 'Naik paket berlaku sejak disetujui; turun paket berlaku setelah paket sekarang berakhir. Berhenti memperpanjang bisa dibatalkan.'],
    warn: ['Paket aktif setelah pembayaran diperiksa, biasanya dalam 1×24 jam pada hari kerja.', 'Bila harga naik, harga lama Anda bisa tetap berlaku saat perpanjang (tertulis di kartu paket).'],
  },
  pengaturan: {
    title: 'Pengaturan', step: 19,
    steps: ['Ubah nama dan alamat kos (tercetak di kwitansi).', 'Info untuk penghuni: WhatsApp, cara bayar, peraturan, plus pilihan email notifikasi bukti transfer dan daftar tagih setiap pagi. Unggah QRIS kos untuk portal.', 'Teks pesan WhatsApp: ubah kata-kata pesan pengingat dan link portal. Ketuk kata berwarna seperti {nama} atau {total} untuk menyisipkan data penghuni, cek Contoh pesan, lalu Simpan.', 'Atur kategori pengeluaran, tambah kos lain, atau keluar dari akun. Di bagian Akun, email arahan selama masa coba bisa dimatikan.', 'Toko: isi nama, alamat, No. WhatsApp toko, dan tulisan di bawah struk — pratinjau struk langsung terlihat.', 'Pengelola juga bisa mengubah pengaturan; pilihan email pemilik hanya bisa diubah pemilik.', 'Pemilik: Unduh Excel atau Unduh PDF berisi semua data kapan saja; Tutup bisnis bila usaha berhenti (data tidak dihapus, bisa dibuka kembali) — lihat Langkah 42.'],
    warn: ['Setelah mengganti QRIS, uji dengan satu pembayaran kecil.', 'Tombol "Kirim daftar tagih sekarang (uji)" hanya mengirim ke email Anda, tidak ke penghuni.'],
  },
  notifikasi: {
    title: 'Notifikasi', step: 23,
    steps: ['Lonceng di kanan atas menunjukkan jumlah hal yang perlu ditindaklanjuti hari ini: pembayaran menunggu diperiksa, tagihan telat, dan jatuh tempo hari ini.', 'Bagian Perlu perhatian: ketuk salah satu untuk langsung membuka menunya.', 'Pengaturan email: pilih laporan yang ingin diterima — daftar tagih harian, ringkasan mingguan (Senin), ringkasan bulanan (tanggal 1). Tekan Kirim contoh untuk mencoba.'],
    warn: ['Semua angka berasal dari data yang Anda catat. Catat pembayaran dan pengeluaran agar ringkasannya akurat.'],
  },
  bisnis: {
    title: 'Ringkasan pemilik', step: 24,
    steps: ['Perlu perhatian: hal penting dari semua bisnis — ketuk untuk langsung ke menunya.', 'Tiap bisnis: pendapatan, biaya, laba, tunggakan/kasbon, utang, kas. Ketuk angka untuk melihat sumber transaksinya. Ganti bulan dengan ‹ ›.', 'Ringkasan manajemen: jumlah per badan usaha dan semua bisnis.'],
    warn: ['"Perkiraan" = ada data belum final (pembayaran belum diverifikasi, barang tanpa harga modal).', 'Jumlah gabungan bukan laporan konsolidasi resmi; kos dan toko memakai basis pencatatan berbeda.'],
  },
  barang: {
    title: 'Barang & stok', step: 25,
    steps: ['Tekan + Tambah barang: isi nama, satuan terkecil (pcs/kg), harga modal, dan stok sekarang.', 'Isi harga eceran dan grosir. Tambah satuan lain seperti dus isi 40 atau renteng isi 10.', 'Tombol Stok: stok opname (isi jumlah fisik), barang rusak, kedaluwarsa, atau koreksi. Semua tercatat di riwayat.', 'Isi peringatan stok minimum agar barang muncul di daftar Menipis dan di lonceng Pengingat.', 'Opsional: Kode barang (kode sendiri) dan Barcode per satuan — ketik angka di kemasan, scan dengan scanner Bluetooth, atau tombol 📷 Pindai.', 'Tanda ☆ = jadikan tombol cepat di Kasir (maks 24). Cetak label: label barcode untuk barang tanpa barcode pabrik.'],
    warn: ['Bila ada cabang/gudang: stok "di sini" = lokasi kerja Anda (kotak 📍); hitung ulang dan barang rusak tercatat di lokasi itu.', 'Harga modal dipakai untuk menghitung laba. Kalau kosong, laba barang itu terlihat terlalu tinggi.', 'Satu barcode hanya untuk satu satuan barang.', 'Pertama kali menekan 📷 Pindai, izinkan akses kamera.'],
  },
  kasir: {
    title: 'Kasir', step: 26,
    steps: ['Pilih Eceran atau Grosir di kanan atas.', 'Cari barang, ketuk tombol satuannya untuk memasukkan ke keranjang.', 'Ketuk bar Keranjang di bawah: atur jumlah/harga, diskon, lalu pilih Tunai, Transfer/QRIS, atau Kasbon.', 'Simpan, lalu cetak atau kirim struk lewat WhatsApp.', 'Barcode: scan dengan scanner Bluetooth/USB (kode masuk ke kolom cari lalu Enter) atau tombol 📷 Pindai (kamera HP) — barang langsung masuk keranjang. Bisa juga ketik kode barang lalu Enter.', 'Tombol barang cepat (barang bertanda ☆ di Barang & stok) tampil di atas daftar: satu ketukan = +1.'],
    warn: ['Bila ada cabang/gudang, pastikan 📍 Lokasi kerja benar: stok yang tampil dan berkurang adalah stok lokasi itu.', 'Kasbon wajib memilih nama pelanggan.', 'Tombol Simpan aman ditekan dua kali — transaksi tidak tercatat ganda.'],
  },
  penjualan: {
    title: 'Penjualan', step: 26,
    steps: ['Lihat transaksi per hari dengan tombol ‹ ›: omzet, laba kotor, dan kasbon.', 'Ketuk transaksi untuk melihat rincian, struk, atau membatalkannya.', 'Barang dikembalikan pelanggan: ketuk transaksinya › Retur barang, isi jumlah yang kembali, pilih uang tunai / transfer balik / potong kasbon, isi alasan, lalu Simpan retur.'],
    warn: ['Laba kotor = omzet − harga modal barang. Isi harga modal di Barang & stok agar akurat.', 'Retur menambah stok lagi dan mengurangi penjualan pada hari retur. Penjualan yang sudah diretur tidak bisa dibatalkan.', 'Retur dan pembatalan hanya untuk pemilik & pengelola.'],
  },
  belanja: {
    title: 'Belanja', step: 27,
    steps: ['Tekan + Belanja, isi tanggal dan supplier.', 'Cari barang, ketuk untuk menambah. Pilih satuan (mis. dus), isi jumlah dan harga beli per satuan itu.', 'Pilih Tunai, Transfer, atau Utang ke supplier, lalu Simpan belanja.', 'Barang rusak/salah kirim: ketuk belanjanya › Retur ke supplier, isi jumlah, pilih potong utang atau uang kembali, tulis alasan.'],
    warn: ['Stok bertambah dan harga modal dihitung ulang (rata-rata) otomatis.', 'Retur ke supplier tidak bisa dibatalkan; belanja yang sudah diretur tidak bisa dibatalkan. Potong utang hanya untuk belanja utang dan maksimal sebesar sisa utang.', 'Bila ada beberapa lokasi, belanja dicatat di lokasi kerja Anda (kotak 📍).', 'Barang belum datang? Pilih Pesan dulu, lalu Terima barang saat datang (boleh sebagian).', 'Barang baru ditambahkan dulu di Barang & stok.'],
  },
  kas: {
    title: 'Kas & kasbon', step: 29,
    steps: ['Pertama kali: + Uang masuk/keluar lain › Setor modal sebesar uang di laci (dan bank).', '+ Biaya untuk listrik, gaji, bensin, dll. Prive untuk uang yang diambil pribadi.', 'Tab Kasbon pelanggan: Terima bayar (boleh dicicil) atau Ingatkan WA.', 'Tab Utang supplier: Bayar saat melunasi belanja utang.', 'Punya cabang/gudang: lihat Uang kas per lokasi; setoran laci antar lokasi lewat Pindahkan uang kas.'],
    warn: ['Saldo dihitung dari catatan. Kalau kas minus, berarti ada uang masuk (mis. modal awal) yang belum dicatat.', 'Prive tidak mengurangi laba, tetapi mengurangi kas.'],
  },
  'laporan-toko': {
    title: 'Laporan toko', step: 30,
    steps: ['Pilih bulan dengan ‹ ›.', 'Laba rugi: penjualan − modal barang − biaya − selisih stok = laba bersih.', 'Produk: Terlaris atau Paling untung. Tidak laku: barang berstok yang tidak terjual bulan itu.', 'Paket Standar: Unduh Excel dan Cetak / PDF.'],
    warn: ['Prive, setoran modal, dan belanja barang tidak dihitung sebagai laba atau biaya.'],
  },
  label: {
    title: 'Cetak label barcode', step: 35,
    steps: ['Barang tanpa kode: tekan Buat kode otomatis (B0001, B0002, …) atau isi kode sendiri di Ubah barang.', 'Tekan + pada barang untuk menentukan jumlah label.', 'Tekan Cetak, pilih printer atau simpan PDF. Tempel label di rak/kemasan, lalu scan di Kasir.'],
    warn: ['Barcode memakai format Code 128 yang dibaca semua scanner umum.', 'Coba scan satu label dulu sebelum mencetak banyak.'],
  },
  pengingat: {
    title: 'Pengingat toko', step: 34,
    steps: ['Ketuk lonceng di kanan atas: stok habis/menipis, pesanan yang lewat perkiraan datang, kasbon dan utang yang jatuh tempo ≤3 hari.', 'Ingatkan WA untuk kasbon; Pesan / belanja barang untuk stok.', 'Pemilik bisa menyalakan email pengingat setiap pagi pukul 07.00 (paket Standar).'],
    warn: ['Stok menipis memakai "peringatan stok minimum" di setiap barang.', 'Email hanya dikirim bila ada yang perlu ditindaklanjuti.'],
  },
  shift: {
    title: 'Shift kasir', step: 33,
    steps: ['Sebelum jualan: hitung uang di laci, isi Uang awal, lalu Buka shift.', 'Selama shift, "Seharusnya di laci" bertambah dari penjualan tunai Anda (dikurangi retur tunai).', 'Selesai: hitung uang di laci, isi jumlahnya, lalu Tutup shift. Hasil: Pas, Lebih, atau Kurang.'],
    warn: ['Shift tidak wajib. Satu kasir hanya punya satu shift terbuka.', 'Selisih hanya dicatat; uang laci yang dipakai untuk biaya tetap dicatat di Kas & kasbon.'],
  },
  persetujuan: {
    title: 'Persetujuan', step: 37,
    steps: ['Menunggu: ketuk permintaan untuk melihat siapa, alasan, data terdampak, dan estimasi nilai.', 'Pemilik: Setujui & jalankan (sistem langsung menjalankan dan mencatat hasilnya) atau Tolak. Karyawan: bisa membatalkan permintaannya sendiri.', 'Aturan (pemilik): pilih tindakan karyawan yang wajib disetujui.'],
    warn: ['Status "Gagal dijalankan" berarti tindakan ditolak sistem saat dijalankan (mis. data sudah berubah) — baca sebabnya di detail.'],
  },
  otomatisasi: {
    title: 'Otomatisasi', step: 38,
    steps: ['Baca pemicu → syarat → tindakan tiap resep, lalu Nyalakan. Berjalan setiap pagi 07.00.', 'Hasil muncul di Pemberitahuan; draf pesanan ke supplier masuk ke Persetujuan.', 'Jalankan sekarang untuk mencoba; Riwayat jalan menunjukkan hasil atau kesalahan.'],
    warn: ['Dijeda otomatis setelah 3 kali gagal; nyalakan lagi setelah penyebabnya diperbaiki.', 'Email hanya untuk paket berbayar atau masa coba. WhatsApp otomatis belum tersedia.'],
  },
  mutasi: {
    title: 'Mutasi stok', step: 40,
    steps: ['Pilih lokasi Dari dan Ke.', 'Cari barang, ketuk untuk menambah, isi jumlah (pilih satuan bila ada dus/pak).', 'Tekan Pindahkan. Riwayat mutasi mencatat nomor, asal–tujuan, waktu, dan siapa.'],
    warn: ['Jumlah tidak boleh melebihi stok di lokasi asal. Total stok dan harga modal tidak berubah.', 'Pemilik selalu melihat menu ini (Lainnya › Mutasi stok). Selama baru ada satu lokasi, isinya tombol + Tambah gudang / cabang. Karyawan melihatnya setelah ada lebih dari satu lokasi.'],
  },
  pembukuan: {
    title: 'Pembukuan', step: 39,
    steps: ['Laporan: laba rugi bulan ini (atau sejak awal tahun) dan neraca per akhir bulan; baca kotak cakupan & status kelengkapan di atasnya.', 'Buku besar: pilih akun untuk melihat mutasi & saldo; ketuk "lihat …" untuk membuka transaksi asal. Jurnal: semua jurnal debit/kredit.', 'Periode & manual (pemilik): tutup bulan yang sudah diperiksa; jurnal manual untuk saldo awal atau penyesuaian.'],
    warn: ['Jurnal dibuat otomatis dari transaksi dan tidak bisa dihapus; pembatalan menghasilkan jurnal pembalikan.', 'Selisih di "Cek kecocokan" hanya ditampilkan — periksa sumbernya sebelum membuat jurnal manual.'],
  },
  konfigurasi: {
    title: 'Pusat konfigurasi', step: 36,
    steps: ['Modul: ketuk untuk melihat fungsi, menu, data, prasyarat, dan paket; lalu Aktifkan/Nonaktifkan (alasan wajib).', 'Saran: rekomendasi dari data 30 hari terakhir — baca alasannya, lalu Terapkan atau Abaikan 30 hari (Langkah 41).', 'Profil: kelompok bisnis, karakteristik usaha, badan usaha. Cabang & gudang: daftar lokasi (pemilik).', 'Permintaan pengelola (mis. ubah modul) diputuskan di menu Persetujuan. Riwayat: semua perubahan tercatat.'],
    warn: ['Menonaktifkan modul tidak menghapus data; aktifkan lagi kapan saja.', 'Modul dengan transaksi terbuka harus diselesaikan dulu sebelum dinonaktifkan.'],
  },
  halaman: {
    title: 'Halaman bisnis', step: 44,
    steps: ['Isi alamat halaman, tagline, tentang, alamat, jam buka, dan WhatsApp.', 'Pilih barang/kamar yang tampil dan apakah harga ditampilkan.', 'Terbitkan, lalu Salin tautan atau Bagikan ke WhatsApp. Permintaan masuk ke Prospek & tindak lanjut.'],
    warn: ['Harga modal, laba, stok persis, dan data pelanggan tidak pernah tampil.', 'Permintaan bukan penjualan: konfirmasi lewat WA, lalu catat di Kasir.', 'Hanya pemilik yang bisa menerbitkan atau menyembunyikan halaman.'],
  },
  crm: {
    title: 'Prospek & tindak lanjut', step: 43,
    steps: ['+ Prospek baru: nama, No. HP, kebutuhan, sumber, perkiraan nilai.', 'Ketuk prospek: pindahkan tahap (Dihubungi, Penawaran, Jadi, Tidak jadi), tulis catatan, dan jadwalkan tindak lanjut.', 'Tab Tindak lanjut: kerjakan yang merah (hari ini/terlewat), Kirim WA, lalu Selesai.'],
    warn: ['Prospek toko yang Jadi otomatis masuk daftar pelanggan, dicocokkan lewat No. HP.', 'Tidak jadi wajib diberi alasan. Catatan tidak bisa dihapus.', 'Jangan simpan data sensitif (KTP, kesehatan, dll.).'],
  },
  kontak: {
    title: 'Pelanggan & supplier', step: 32,
    steps: ['Pilih tab Pelanggan atau Supplier; cari dengan nama atau nomor.', 'Ketuk nama untuk melihat sisa kasbon/utang, riwayat transaksi, dan mengubah nama atau nomor WA.', 'Sisa kasbon: Terima bayar di Kas, atau Ingatkan WA.', 'Pelanggan: tulis catatan & jadwalkan tindak lanjut di bagian bawah (Langkah 43).'],
    warn: ['Staf gudang hanya melihat supplier, tanpa saldo.', 'Hapus: kontak tanpa transaksi dihapus permanen; yang sudah punya riwayat diarsipkan (riwayat & laporan tetap utuh, bisa dipulihkan lewat Lihat arsip). Sisa kasbon/utang harus lunas dulu.'],
  },
  karyawan: {
    title: 'Karyawan', step: 31,
    steps: ['Isi email karyawan, pilih peran, lalu Undang.', 'Kirim cara masuk via WA: karyawan Daftar dengan email itu di halaman Masuk, lalu langsung bekerja di bisnis Anda.', 'Ubah peran, Nonaktifkan, atau Hapus dari daftar. Bersihkan = hapus semua email nonaktif & undangan kedaluwarsa.'],
    warn: ['Punya cabang/gudang: pilih 📍 Lokasi kerja tiap karyawan agar transaksinya selalu tercatat di lokasi itu.', 'Batas: Gratis 1, Standar 3, Pro tanpa batas. Undangan berlaku 14 hari.', 'Hak tiap peran diperiksa di database, bukan hanya disembunyikan dari menu.'],
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
    steps: ['Tab Menunggu: cocokkan nominal & nomor invoice dengan mutasi rekening/QRIS, lalu Uang masuk, aktifkan — atau Tolak. Bisa oleh Super Admin dan staf Keuangan.', 'Tab Riwayat untuk semua pembayaran; tab Langganan aktif diurutkan dari yang paling dulu berakhir.', 'Tab Perubahan paket: siapa mengubah paket siapa, sebelum → sesudah, dan alasannya.'],
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
  'admin-paket': {
    title: 'Paket & harga', admin: true,
    steps: ['Setiap paket: harga per bulan per bisnis, batas (kamar terisi, karyawan), dan fitur.', 'Ubah harga / fitur = versi baru dengan alasan wajib; riwayat versi tersimpan dan tercatat di audit.', 'Pilih aturan pelanggan lama: ikut harga baru atau tetap harga lama saat perpanjang.', '+ Paket baru: dibuat tersembunyi dengan harga Rp 0; atur harga & fitur, lalu tampilkan.', 'Pengaturan: masa tenggang setelah paket habis dan paket selama masa coba.'],
    warn: ['Fitur & batas versi baru langsung berlaku untuk semua bisnis di paket itu. Harga baru hanya untuk pembelian berikutnya.', 'Hanya Super Admin yang bisa mengubah; staf lain hanya melihat.'],
  },
  'admin-sistem': {
    title: 'Status sistem', admin: true,
    steps: ['Database, jadwal otomatis 07.00 WIB, dan jumlah email hari ini.', 'Daftar layanan hanya menunjukkan Terpasang/Belum — nilai kunci rahasia tidak pernah ditampilkan.', 'Riwayat jadwal: ✓/✗ untuk pengingat, pendampingan, dan ringkasan.'],
    warn: ['Bila jadwal "Periksa", buka Vercel › Logs untuk detail galat.'],
  },
};
