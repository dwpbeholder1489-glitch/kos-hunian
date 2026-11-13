// Isi tombol "? Panduan" di setiap menu aplikasi. step = nomor langkah di halaman /panduan
export const PAGE_HELP = {
  beranda: {
    title: 'Dashboard', step: 14,
    steps: ['Kas bersih = uang masuk − pengeluaran bulan ini.', 'Hunian menghitung kamar terisi dari kamar yang bisa disewakan.', 'Penghuni menunggak dan tagihan 7 hari ke depan tampil di bawah. Ketuk untuk menindaklanjuti.'],
    warn: ['Kas bersih bukan laba. Untuk laba yang benar lihat menu Laporan.'],
  },
  operasional: {
    title: 'Modul Bisnis', step: 1,
    steps: ['Ketuk kelompok (Operasional, Transaksi, Pelanggan, Inventaris, Keuangan, Laporan, Pengaturan Bisnis) untuk melihat menunya.', 'Ketik di kotak cari untuk langsung menemukan menu, mis. "kas" atau "booking".', 'Tombol + di menu bawah berisi aksi cepat, mis. Catat pembayaran, Pesanan baru, atau Catat biaya.'],
    warn: ['Menu yang tidak sesuai jenis bisnis, peran Anda, atau modul yang dimatikan memang tidak ditampilkan.'],
  },
  media: {
    title: 'Foto & media', step: 71,
    steps: ['+ Foto: Kamera atau Galeri (bisa beberapa), atur rasio/putar/posisi, lalu Simpan.', 'Ketuk foto: lihat Dipakai di mana, ubah keterangan, Ganti gambar (berlaku di semua tempat), Lepas dari satu tempat, atau Hapus.', 'Tempelkan foto ke data lewat menunya: Kamar / Barang / Layanan › + Foto, dan Halaman bisnis › Cover & Galeri. Pilih dari pustaka agar tidak unggah ulang.', 'Foto utama tiap kamar/barang/layanan tampil kecil di daftar dan di Kasir agar mudah dikenali.'],
    warn: ['Foto di sini untuk ditampilkan ke pelanggan. Bukti & dokumentasi internal pakai 📎 Lampiran (privat).', 'Kuota penyimpanan dihitung bersama lampiran sesuai paket.', 'Hapus foto yang masih dipakai akan melepasnya dari semua tempat.'],
  },
  kamar: {
    title: 'Kamar', step: 3,
    steps: ['Ketuk kamar → Ubah data kamar untuk mengisi harga, fasilitas, dan status.', 'Ketuk kamar → + Foto: foto kamar tampil di halaman bisnis saat kamar tersedia (Langkah 71).', 'Ketuk kamar berstatus Tersedia → Isi kamar ini untuk memasukkan penghuni.', 'Tambah kamar baru dengan tombol + Kamar.'],
    warn: ['Status Terisi diatur otomatis oleh data sewa, tidak perlu diubah manual.', 'Kamar yang pernah disewa tidak bisa dihapus agar riwayatnya tetap ada.'],
  },
  penghuni: {
    title: 'Penghuni', step: 9,
    steps: ['Ketuk penghuni untuk melihat kamar, tagihan, dan tunggakannya.', 'Kirim pengingat via WhatsApp, atau kirim link Portal penghuni (Pro) agar penghuni bisa cek tagihan & kirim bukti sendiri. Kata-kata pesannya bisa diubah lewat "Ubah teks pesan WhatsApp".', 'Akhiri sewa saat penghuni benar-benar keluar (tanggal hari ini atau sebelumnya) — kamar otomatis kembali tersedia.'],
    warn: ['Portal penghuni belum aktif? Detail penghuni › Aktifkan portal penghuni (sekali untuk semua).', 'Isi nomor WhatsApp agar tombol pengingat muncul. Isi email (atau biarkan penghuni mengisinya di portal) untuk pengingat otomatis.', 'Penghuni lama: isi "Tagihan pertama jatuh tempo" dengan jatuh tempo berikutnya yang belum dibayar.', 'Deposit/uang jaminan ada di detail penghuni (Langkah 51): bukan pendapatan; kembalikan atau potong saat penghuni keluar.', 'Penghuni akan pindah? Isi Rencana selesai › ubah di detail penghuni; kamarnya bisa dibooking untuk tanggal setelahnya (Langkah 54).', 'Foto KTP/surat perjanjian: detail penghuni › 📎 Dokumen penghuni (Langkah 63); hanya pemilik & bagian sewa yang bisa membuka.'],
  },
  tagihan: {
    title: 'Tagihan', step: 6,
    steps: ['Tagihan sewa terbit otomatis 7 hari sebelum jatuh tempo.', 'Ketuk tagihan → Catat pembayaran (boleh sebagian).', 'Biaya di luar sewa (listrik, laundry, denda): + Tagihan tambahan.'],
    warn: ['Catat pembayaran transfer/QRIS hanya setelah uang benar-benar masuk ke rekening.', 'Tagihan yang sudah punya pembayaran tidak bisa dibatalkan — batalkan pembayarannya dulu.', 'Penghuni punya deposit? Metode "Dipotong dari deposit" melunasi tagihan tanpa uang masuk baru.', 'Tagihan listrik/air dibuat otomatis dari menu Meteran (Langkah 53).'],
  },
  pembayaran: {
    title: 'Pembayaran', step: 8,
    steps: ['Pembayaran yang belum dicek dan bukti dari portal penghuni (label "Dikirim penghuni") muncul di "Menunggu verifikasi".', 'Ketuk Lihat bukti, cocokkan dengan mutasi rekening, lalu ketuk Uang sudah masuk atau Tolak.', 'Geser bulan dengan tombol ‹ › untuk melihat riwayat.'],
    warn: ['Jangan menekan "Uang sudah masuk" hanya dari foto bukti — selalu cek mutasi rekening.', 'Membatalkan pembayaran membuat tagihannya kembali belum lunas.'],
  },
  pengeluaran: {
    title: 'Pengeluaran', step: 11,
    steps: ['Tab Biaya kos: + Catat, isi jumlah (boleh 350rb atau 1,2jt), tanggal, dan kategori — termasuk gaji pengelola/penjaga.', 'Tab Diambil pemilik & lainnya: uang kos yang dipakai pribadi (prive), setoran modal, pendapatan lain, dan pinjaman.', 'Ketuk catatan untuk mengubah atau menghapus. Kategori bisa ditambah di Pengaturan.', 'Foto nota: setelah Simpan langsung ada 📎 Foto nota, atau ketuk catatan biaya kapan saja (Langkah 63).'],
    warn: ['Catat semua uang keluar, sekecil apa pun, agar saldo kas cocok.', 'Uang yang diambil pemilik untuk pribadi bukan biaya kos — catat di tab kedua, bukan di Biaya kos.', 'Renovasi dan beli perabot pakai kategori jenis Modal — tidak mengurangi laba operasional.', 'Mengembalikan deposit penghuni: pakai Penghuni › Deposit › Kembalikan, bukan di sini (deposit bukan biaya).'],
  },
  laporan: {
    title: 'Laporan', step: 15,
    steps: ['Pilih bulan dengan tombol ‹ ›.', 'Baca Laba rugi: pendapatan − biaya operasional = laba operasional.', 'Biaya operasional per kategori tampil di bawah laba rugi.', 'Paket Standar: grafik 6 bulan (pendapatan vs biaya — ketuk batang untuk angkanya), pendapatan per kamar, ekspor Excel, dan cetak PDF.'],
    warn: ['Ekspor Excel & cetak PDF dihitung per bulan sesuai paket (Dasar 10, Bisnis 100, Pro 500); sisa kuota tampil di dekat tombol. Bisnis yang ditutup tetap bisa mengunduh tanpa dihitung.', 'Pemilik Paket Dasar yang membuka Laporan bisa melihat penawaran Paket Bisnis (paling sering tiap 14 hari; bisa ditutup).', 'Laporan berbasis kas: pendapatan dihitung saat uang diterima, bukan saat ditagih.', 'Deposit diterima/dikembalikan ikut arus kas, bukan pendapatan. Potongan deposit untuk kerusakan = pendapatan lain.'],
  },
  langganan: {
    title: 'Langganan', step: 18,
    steps: ['Pilih paket (Dasar, Bisnis, Pro) dan durasi. Harga normal dicoret di atas harga yang berlaku; Pro punya pilihan 1 tahun (dibayar sekali).', 'Bayar lewat QRIS, transfer, atau Lynk.id sesuai nominal. Dengan Lynk.id, ketuk Buat tagihan & buka Lynk.id, lalu isi email akun Anda di halaman Lynk — paket aktif otomatis.','Ketuk Saya sudah bayar, lalu kirim bukti via WhatsApp. Nomor invoice dan ID transaksi muncul di Riwayat tagihan — ketuk untuk melihat/cetak. Tagihan punya batas waktu bayar 3 hari.', 'Salah pilih dan belum membayar? Ketuk Belum bayar — batalkan, lalu pilih lagi.', 'Naik paket berlaku sejak disetujui; turun paket berlaku setelah paket sekarang berakhir. Berhenti memperpanjang bisa dibatalkan.'],
    warn: ['Paket aktif setelah pembayaran diperiksa, biasanya dalam 1×24 jam pada hari kerja (Lynk.id: otomatis, bila email di Lynk sama dengan akun). Setelah disetujui, kartu Upgrade Berhasil! muncul sekali di HP mana pun: paket, jumlah dibayar, masa aktif, kapasitas & fitur baru. Bila dari penawaran, tombolnya membawa kembali ke formulir yang tadi tertahan.', 'Kuota karyawan, kamar terisi, ruang lampiran, produk/layanan aktif, pelanggan, supplier, cabang, dan ekspor bulanan dipantau: di 80% muncul peringatan, di 100% peringatan merah. Tutup peringatan muncul lagi setelah 7 hari. Masa coba punya pengingat di hari ke-10, ke-12, hari terakhir, dan saat berakhir.', 'Berhenti memperpanjang langsung berlaku; sesudahnya Anda boleh memilih alasan (opsional, bisa dilewati) untuk masukan bagi PRASARA.', 'Bila harga naik, harga lama Anda bisa tetap berlaku saat perpanjang (tertulis di kartu paket).', 'Penawaran upgrade (Bisnis saat karyawan/cabang penuh; Pro saat cabang Bisnis penuh; Pro Tahunan untuk Pro bulanan) muncul paling banyak sekali per 7 hari dan bisa ditutup kapan saja. Data Anda tidak berubah sebelum pembayaran disetujui.'],
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
    steps: ['Tekan + Tambah barang: isi nama, satuan terkecil (pcs/kg), harga modal, dan stok sekarang.', 'Isi harga eceran dan grosir. Tambah satuan lain seperti dus isi 40 atau renteng isi 10. Barang curah per kg: + ¼ kg / + ½ kg (isi 0,25 / 0,5 otomatis).', 'Tombol Stok: stok opname (isi jumlah fisik), barang rusak, kedaluwarsa, atau koreksi. Semua tercatat di riwayat.', 'Isi peringatan stok minimum agar barang muncul di daftar Menipis dan di lonceng Pengingat.', 'Opsional: Kode barang (kode sendiri) dan Barcode per satuan — ketik angka di kemasan, scan dengan scanner Bluetooth, atau tombol 📷 Pindai.', 'Tanda ☆ = jadikan tombol cepat di Kasir (maks 24). Cetak label: label barcode untuk barang tanpa barcode pabrik.', 'Ubah barang → + Foto: foto produk untuk katalog halaman bisnis (Langkah 71).'],
    warn: ['Jumlah barang aktif mengikuti paket (Gratis/Dasar 100, Bisnis 1.000, Pro 5.000). Saat penuh, nonaktifkan barang yang tidak dijual lagi atau naik paket; barang lama tetap bisa diubah.', 'Bila ada cabang/gudang: stok "di sini" = lokasi kerja Anda (kotak 📍); hitung ulang dan barang rusak tercatat di lokasi itu.', 'Harga modal dipakai untuk menghitung laba. Kalau kosong, laba barang itu terlihat terlalu tinggi.', 'Isi satuan = berapa satuan terkecil dalam 1 satuan itu (1 dus = 40 pcs; ¼ kg = 0,25 kg). Baca baris hitungan di bawahnya sebelum menyimpan.', 'Satu barcode hanya untuk satu satuan barang.', 'Pertama kali menekan 📷 Pindai, izinkan akses kamera.'],
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
    steps: ['Pertama kali: + Uang masuk/keluar lain › Setor modal sebesar uang di laci (dan bank).', '+ Biaya untuk listrik, gaji, bensin, dll. Prive untuk uang yang diambil pribadi.', 'Tab Kasbon pelanggan: Terima bayar (boleh dicicil) atau Ingatkan WA.', 'Tab Utang supplier: Bayar saat melunasi belanja utang.', 'Punya cabang/gudang: lihat Uang kas per lokasi; setoran laci antar lokasi lewat Pindahkan uang kas.', 'Foto nota biaya: tombol 📎 di baris biaya (Langkah 63).'],
    warn: ['Saldo dihitung dari catatan. Kalau kas minus, berarti ada uang masuk (mis. modal awal) yang belum dicatat.', 'Prive tidak mengurangi laba, tetapi mengurangi kas.'],
  },
  'laporan-toko': {
    title: 'Laporan toko', step: 30,
    steps: ['Pilih bulan dengan ‹ ›.', 'Laba rugi: penjualan − modal barang − biaya − selisih stok = laba bersih.', 'Grafik penjualan harian: ketuk kolom untuk melihat angka hari itu.', 'Produk: Terlaris atau Paling untung. Tidak laku: barang berstok yang tidak terjual bulan itu.', 'Paket Standar: Unduh Excel dan Cetak / PDF.'],
    warn: ['Prive, setoran modal, dan belanja barang tidak dihitung sebagai laba atau biaya.', 'Ekspor Excel & cetak PDF dihitung per bulan sesuai paket (Dasar 10, Bisnis 100, Pro 500); sisa kuota tampil di dekat tombol. Bisnis yang ditutup tetap bisa mengunduh tanpa dihitung.'],
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
    steps: ['Menunggu: ketuk permintaan untuk melihat siapa, alasan, data terdampak, dan estimasi nilai.', 'Pemilik: Setujui & jalankan (sistem langsung menjalankan dan mencatat hasilnya) atau Tolak. Karyawan: bisa membatalkan permintaannya sendiri.', 'Aturan (pemilik): pilih tindakan karyawan yang wajib disetujui. Paket Pro: pilih 1 atau 2 tingkat dan nominal mulai tingkat 2.', 'Penyetuju tingkat 1 (Paket Pro): buka permintaan karyawan lain, Setujui tingkat 1 (diteruskan ke pemilik) atau Tolak.'],
    warn: ['Status "Gagal dijalankan" berarti tindakan ditolak sistem saat dijalankan (mis. data sudah berubah) — baca sebabnya di detail.', 'Mengubah aturan sendiri: mulai Paket Bisnis (bisnis lama tetap bisa). Aturan bawaan berlaku di semua paket.', 'Persetujuan bertingkat & penyetuju tingkat 1: Paket Pro. Pemilik selalu bisa langsung memutuskan; peminta tidak bisa menyetujui permintaannya sendiri.'],
  },
  otomatisasi: {
    title: 'Otomatisasi', step: 38,
    steps: ['Baca pemicu → syarat → tindakan tiap resep, lalu Nyalakan. Berjalan setiap pagi 07.00.', 'Hasil muncul di Pemberitahuan; draf pesanan ke supplier masuk ke Persetujuan.', 'Jalankan sekarang untuk mencoba; Riwayat jalan menunjukkan hasil atau kesalahan.'],
    warn: ['Menyalakan resep: mulai Paket Bisnis (bisnis lama tetap bisa); mematikan selalu bisa.', 'Dijeda otomatis setelah 3 kali gagal; nyalakan lagi setelah penyebabnya diperbaiki.', 'Email hanya untuk paket berbayar atau masa coba. WhatsApp otomatis belum tersedia.', 'Resep bertanda Pro (penjualan turun, biaya mendekati anggaran, sewa segera berakhir, ringkasan mingguan) dan pilihan hari jalan: Paket Pro.'],
  },
  mutasi: {
    title: 'Mutasi stok', step: 40,
    steps: ['Pilih lokasi Dari dan Ke.', 'Cari barang, ketuk untuk menambah, isi jumlah (pilih satuan bila ada dus/pak).', 'Tekan Pindahkan. Riwayat mutasi mencatat nomor, asal–tujuan, waktu, dan siapa.'],
    warn: ['Jumlah tidak boleh melebihi stok di lokasi asal. Total stok dan harga modal tidak berubah.', 'Pemilik selalu melihat menu ini (Operasional › Mutasi stok). Selama baru ada satu lokasi, isinya tombol + Tambah gudang / cabang. Karyawan melihatnya setelah ada lebih dari satu lokasi.'],
  },
  anggaran: {
    title: 'Anggaran', step: 39,
    steps: ['Pilih bulan dengan tombol ‹ ›.', 'Isi anggaran tiap kategori biaya, lalu ketuk di luar kotak untuk menyimpan (kosongkan untuk menghapus).', 'Baca bilah: hijau aman, kuning ≥80%, merah melebihi; angka Sisa/Melebihi di bawahnya.', 'Bulan baru: Salin anggaran bulan lalu, atau Pakai Rp … (realisasi bulan lalu).'],
    warn: ['Mulai Paket Bisnis. Di paket lain halaman ini tetap menampilkan pengeluaran per kategori.', 'Realisasi = pengeluaran yang tercatat pada bulan itu; pengeluaran tanpa kategori tidak bisa dianggarkan.', 'Setiap perubahan tercatat di Konfigurasi › Riwayat.'],
  },
  pembukuan: {
    title: 'Pembukuan', step: 39,
    steps: ['Laporan: laba rugi bulan ini (atau sejak awal tahun) dan neraca per akhir bulan; baca kotak cakupan & status kelengkapan di atasnya.', 'Buku besar: pilih akun untuk melihat mutasi & saldo; ketuk "lihat …" untuk membuka transaksi asal. Jurnal: semua jurnal debit/kredit.', 'Periode & manual (pemilik): tutup bulan yang sudah diperiksa; jurnal manual untuk saldo awal atau penyesuaian.'],
    warn: ['Arus kas: semua paket melihat saldo awal, uang masuk/keluar, saldo akhir; Paket Bisnis melihat per aktivitas (operasi, investasi, pendanaan).', 'Neraca per akun, rincian buku besar, laba rugi per lokasi, dan gabungan badan usaha: mulai Paket Bisnis (bisnis lama tetap). Paket lain melihat laba rugi lengkap & neraca ringkas.', 'Rekonsiliasi bank (Paket Bisnis): isi saldo rekening koran akhir bulan, centang baris yang sudah ada di rekening koran; selesai hanya bila selisih 0.', 'Jurnal manual: mulai Paket Bisnis (bisnis lama tetap bisa). Jurnal otomatis berjalan di semua paket.', 'Jurnal dibuat otomatis dari transaksi dan tidak bisa dihapus; pembatalan menghasilkan jurnal pembalikan.', 'Selisih di "Cek kecocokan" hanya ditampilkan — periksa sumbernya sebelum membuat jurnal manual.'],
  },
  konfigurasi: {
    title: 'Pusat konfigurasi', step: 36,
    steps: ['Modul: ketuk untuk melihat fungsi, menu, data, prasyarat, dan paket; lalu Aktifkan/Nonaktifkan (alasan wajib).', 'Saran: rekomendasi dari data 30 hari terakhir — baca alasannya, lalu Terapkan atau Abaikan 30 hari (Langkah 41).', 'Profil: kelompok bisnis, karakteristik usaha, badan usaha. Cabang & gudang: daftar lokasi (pemilik).', 'Permintaan pengelola (mis. ubah modul) diputuskan di menu Persetujuan. Riwayat: semua perubahan tercatat.', 'Isian tambahan: tambahkan isian sendiri ke Penghuni/Barang/Pesanan/Kontak (Langkah 62).'],
    warn: ['Jumlah cabang mengikuti paket (Gratis/Dasar 1, Bisnis 3, Pro 10; lokasi utama ikut dihitung, gudang tidak). Saat penuh muncul penawaran naik paket.', 'Menonaktifkan modul tidak menghapus data; aktifkan lagi kapan saja.', 'Modul dengan transaksi terbuka harus diselesaikan dulu sebelum dinonaktifkan.'],
  },
  halaman: {
    title: 'Halaman bisnis', step: 44,
    steps: ['Isi alamat halaman, tagline, tentang, alamat, jam buka, dan WhatsApp.', 'Pilih barang/kamar yang tampil dan apakah harga ditampilkan.', 'Tautan: + Lokasi (Google Maps), Instagram, Foto, atau tautan lain (maks 6) — salin lewat Bagikan › Salin tautan di aplikasinya, lalu tempel.', 'Terbitkan (atau langsung dari ikon Bagikan › Terbitkan sekarang). Lalu dari menu mana pun ketuk ikon Bagikan (pojok kanan atas): QR code, Bagikan…, WhatsApp, Salin tautan, Simpan gambar QR, Cetak poster QR.', 'Permintaan masuk ke Prospek & tindak lanjut (jasa: langsung jadi pesanan). Kos: calon penghuni bisa mendaftar lengkap (data diri, kamar, booking/langsung huni, DP/lunas) — Langkah 70.', 'Kos: centang "Tampilkan rekening/QRIS di formulir pendaftaran penghuni" agar calon penghuni bisa langsung transfer.'],
    warn: ['Menerbitkan halaman (Portal bisnis: katalog, pendaftaran & pemesanan online, QR) tersedia di Paket Pro; bisnis yang dibuat sebelum 14 Nov 2026 tetap bisa. Di paket lain isinya bisa disiapkan & disimpan dulu.', 'Harga modal, laba, stok persis, dan data pelanggan tidak pernah tampil.', 'Permintaan baru jadi booking/pesanan/penjualan setelah Anda tekan Konfirmasi. Jasa/laundry: pelanggan yang memilih layanan langsung membuat pesanan berstatus Permintaan masuk (Langkah 66).', 'Logo: unggah di bagian atas; tampil di halaman & aplikasi.', 'Hanya pemilik yang bisa menerbitkan atau menyembunyikan halaman.'],
  },
  crm: {
    title: 'Prospek & tindak lanjut', step: 43,
    steps: ['Kos — pendaftaran penghuni: ketuk → Data pendaftar & Lihat bukti transfer → cek mutasi → Uang sudah masuk → isi → Konfirmasi (Langsung huni: penghuni + sewa + tagihan + pembayaran otomatis; Booking: masuk Booking kamar) (Langkah 70).', 'Permintaan dari halaman bisnis berlabel Perlu konfirmasi: ketuk → lihat hasil cek otomatis (kamar kosong, stok, harga, No. HP ganda) → Konfirmasi (kos: jadi booking; toko: keranjang Kasir terisi) → kabari lewat WA.', '+ Prospek baru: nama, No. HP, kebutuhan, sumber, perkiraan nilai.', 'Ketuk prospek: pindahkan tahap (Dihubungi, Penawaran, Jadi, Tidak jadi), tulis catatan, dan jadwalkan tindak lanjut.', 'Tab Tindak lanjut: kerjakan yang merah (hari ini/terlewat), Kirim WA, lalu Selesai.'],
    warn: ['Prospek toko yang Jadi otomatis masuk daftar pelanggan, dicocokkan lewat No. HP.', 'Tidak jadi wajib diberi alasan. Catatan tidak bisa dihapus.', 'Jangan simpan data sensitif (KTP, kesehatan, dll.).'],
  },
  kontak: {
    title: 'Pelanggan & supplier', step: 32,
    steps: ['Pilih tab Pelanggan atau Supplier; cari dengan nama atau nomor.', 'Ketuk nama untuk melihat sisa kasbon/utang, riwayat transaksi, dan mengubah nama atau nomor WA.', 'Sisa kasbon: Terima bayar di Kas, atau Ingatkan WA.', 'Pelanggan: tulis catatan & jadwalkan tindak lanjut di bagian bawah (Langkah 43).'],
    warn: ['Jumlah kontak mengikuti paket: pelanggan 500 / 5.000 / 20.000 dan supplier 100 / 1.000 / 5.000 (Gratis·Dasar / Bisnis / Pro). Kontak yang diarsipkan tidak dihitung.', 'Staf gudang hanya melihat supplier, tanpa saldo.', 'Hapus: kontak tanpa transaksi dihapus permanen; yang sudah punya riwayat diarsipkan (riwayat & laporan tetap utuh, bisa dipulihkan lewat Lihat arsip). Sisa kasbon/utang harus lunas dulu.'],
  },
  karyawan: {
    title: 'Karyawan', step: 31,
    steps: ['Isi email karyawan, pilih peran, lalu Undang.', 'Kirim cara masuk via WA: karyawan Daftar dengan email itu di halaman Masuk, lalu langsung bekerja di bisnis Anda.', 'Ubah peran, Nonaktifkan, atau Hapus dari daftar. Bersihkan = hapus semua email nonaktif & undangan kedaluwarsa.', 'Atur akses: pilih modul tiap karyawan (Paket Bisnis), izin per tindakan dan penyetuju tingkat 1 (Paket Pro), lalu Simpan.'],
    warn: ['Punya cabang/gudang: pilih 📍 Lokasi kerja tiap karyawan agar transaksinya selalu tercatat di lokasi itu.', 'Batas karyawan: Gratis/Dasar 1, Bisnis 5, Pro 15. Saat batas penuh, tombol Undang membuka pilihan upgrade paket. Undangan berlaku 14 hari.', 'Hak tiap peran diperiksa di database, bukan hanya disembunyikan dari menu.', 'Paket turun: pengaturan akses tidak dihapus, hanya tidak berlaku (kembali ke hak peran) sampai paket naik.'],
  },
  // ---- Business Builder (Langkah 55–60) ----
  builder: {
    title: 'Business Builder', step: 55,
    steps: ['1. Profil: deskripsi, model pendapatan, proses utama, lokasi.', '2. Data & formulir: + Jenis data, + Field (tipe, wajib, pilihan, rujukan, sembunyikan dari peran), pilih field judul.', '3. Alur & peran: status (awal/akhir/batas jam) dan aturan langkah per peran, wajib catatan, perlu persetujuan.', '4. Laporan: metrik jumlah/total/rata-rata per status/bulan/field.', '5. Validasi & aktifkan: perbaiki yang Wajib, lalu pemilik menekan Aktifkan bisnis.'],
    warn: ['Field yang sudah berisi data tidak bisa diganti tipenya; nonaktifkan lalu buat baru (isi lama tidak hilang).', 'Atur 💰 Uang masuk di jenis data yang menghasilkan uang agar Kas & laporan keuangan terisi (Langkah 61).', 'Foto/file bukan tipe field: setiap catatan punya panel 📎 Lampiran (Langkah 63).'],
  },
  konfirmasi: {
    title: 'Pusat Konfirmasi', step: 64,
    steps: ['Lihat kelengkapan data dan semua yang disiapkan PRASARA (profil, layanan, alur, modul, halaman pelanggan).', 'Lengkapi/Ubah isinya, lalu Simpan & setujui. Putuskan bagian lain: Setujui, Tunda, atau Tolak. Modul: Setujui semua yang disarankan.', 'Tinjau seluruh konfigurasi & aktifkan: hanya yang disetujui yang diaktifkan.'],
    warn: ['Harga, kapasitas, dan jumlah karyawan tidak diisi otomatis — isi sesuai kenyataan.', 'Selama draf, transaksi ditolak. Halaman bisnis tetap draf sampai Anda terbitkan.', 'Keputusan setujui/tolak/tunda & aktivasi hanya oleh pemilik; semua tercatat di Riwayat.'],
  },
  'kas-kustom': {
    title: 'Kas & biaya', step: 61,
    steps: ['Saldo kas & bank = uang masuk catatan (diatur di Builder › Uang masuk) − biaya + uang lain.', 'Pertama kali: + Uang masuk/keluar lain › Setor modal sebesar uang di laci (dan bank).', '+ Biaya untuk gaji, sewa, bahan, listrik, dll. Tambahkan foto nota lewat 📎 (Langkah 63).'],
    warn: ['Uang masuk dihitung saat catatan mencapai status yang diatur; dibatalkan/diarsipkan = tidak dihitung.', 'Prive mengurangi kas, bukan laba.'],
  },
  catatan: {
    title: 'Catatan', step: 60,
    steps: ['Pilih jenis data di atas, tekan + [nama jenis], isi formulir, simpan.', 'Ketuk catatan › → [status] untuk memindahkan sesuai alur.', 'Saring per status/field atau cari; Ubah isi; lihat Riwayat dan Dipakai di.', 'Data salah: Arsipkan (pemilik/pengelola); arsip bisa dilihat lewat Lihat arsip.', 'Foto/PDF (mis. kondisi kendaraan, nota): ketuk catatan › 📎 Lampiran › + Foto / file (Langkah 63).'],
    warn: ['Langkah yang tidak diizinkan alur/peran akan ditolak.', 'Langkah "perlu persetujuan" dikirim ke pemilik di menu Persetujuan.'],
  },
  kerja: {
    title: 'Dashboard bisnis kustom', step: 60,
    steps: ['Belum selesai, Lewat batas waktu, Tugas saya, Dicatat hari ini.', 'Ketuk tombol jenis data untuk membuka Catatan; ketuk catatan di daftar untuk membukanya.', 'Jumlah per status untuk tiap jenis data yang memakai alur.'],
    warn: ['Batas waktu diatur per status di Business Builder › Alur.', 'Email/WhatsApp otomatis untuk bisnis kustom belum tersedia.'],
  },
  'laporan-kustom': {
    title: 'Laporan kustom', step: 58,
    steps: ['Pilih laporan dan periode (bulan ini, 30 hari, 12 bulan, semua, atau tanggal sendiri).', 'Lihat total dan rincian per kelompok dengan batang perbandingan.', 'Paket Standar: Unduh Excel.'],
    warn: ['Ekspor Excel & cetak PDF dihitung per bulan sesuai paket (Dasar 10, Bisnis 100, Pro 500); sisa kuota tampil di dekat tombol. Bisnis yang ditutup tetap bisa mengunduh tanpa dihitung.', 'Dihitung dari catatan yang tidak diarsipkan, berdasarkan tanggal catatan dibuat.', 'Angka uang bisnis kustom belum menjadi pembukuan resmi.'],
  },
  // ---- Kos lanjutan (Langkah 51–53) ----
  perbaikan: {
    title: 'Keluhan & perbaikan', step: 52,
    steps: ['+ Catat keluhan: pilih kamar atau area umum, jenis, masalahnya, prioritas, dan siapa yang menangani.', 'Kamar kosong yang rusak bisa ditutup sementara (status Perbaikan); otomatis Tersedia lagi saat selesai.', 'Ketuk keluhan: Mulai dikerjakan, Menunggu…, lalu Selesai dengan apa yang dikerjakan dan biayanya (centang Catat biaya di Pengeluaran).', 'Laporan dari portal penghuni masuk ke sini sebagai "dari penghuni". Kabari penghuni dengan WA penghuni.', 'Foto kerusakan sebelum/sesudah dan nota bahan: 📎 Foto kerusakan / nota di detail keluhan (Langkah 63).'],
    warn: ['Biaya hanya masuk laporan bila dicatat di Pengeluaran (pemilik/pengelola).', 'Batal & buka kembali wajib alasan; semua perubahan tercatat di Riwayat.'],
  },
  booking: {
    title: 'Booking kamar', step: 54,
    steps: ['+ Booking: pilih kamar, isi calon penghuni, tanggal masuk, sewa yang disepakati, dan DP bila ada.', 'Kirim WA konfirmasi. Kamar ditandai Dibooking dan tidak bisa diisi orang lain.', 'Saat penghuni datang: ketuk booking › Check-in. DP jadi deposit atau langsung bayar tagihan pertama.', 'Tidak jadi: Batalkan booking, isi DP yang dikembalikan; sisanya hangus.'],
    warn: ['DP bukan pendapatan sampai check-in atau hangus.', 'Kamar masih terisi: isi rencana selesai sewa penghuninya dulu (Penghuni › ketuk nama › Rencana selesai › ubah), lalu booking untuk tanggal setelahnya.', 'Booking ber-DP hanya bisa dibatalkan pemilik/pengelola.'],
  },
  meteran: {
    title: 'Meteran listrik & air', step: 53,
    steps: ['Pertama kali: + Listrik (kWh) atau + Air (m³), isi tarif dan tagihan minimal bila ada.', 'Bulan pertama: isi angka awal tiap kamar (belum ditagih).', 'Bulan berikutnya: isi angka sekarang, cek pemakaian & jumlahnya, isi jatuh tempo, lalu Simpan & buat tagihan.', 'Salah angka: Batalkan di kamar itu lalu isi ulang (tagihan ikut batal bila belum dibayar).'],
    warn: ['Angka lebih kecil dari bulan lalu ditolak — centang Meteran baru bila meteran diganti.', 'Kamar kosong dicatat tanpa tagihan. Ubah tarif hanya memengaruhi catatan berikutnya.'],
  },
  // ---- Jasa & Laundry (Langkah 45–50) ----
  jasa: {
    title: 'Dashboard jasa', step: 47,
    steps: ['Kotak angka: pesanan baru hari ini, menunggu penjemputan, siap diambil, dalam pengantaran, terlambat, pendapatan, dan pembayaran tertunda.', 'Ringkasan pesanan: menunggu jemput, belum diproses, sedang per tahap (dicuci, dikeringkan, disetrika…), siap, dalam pengantaran, selesai hari ini.', 'Daftar Terlambat, Harus selesai hari ini, Perlu dijemput, dan Siap diantar — ketuk untuk membuka Pesanan.'],
    warn: ['Semua angka dari pesanan nyata; bila belum ada pesanan, dashboard menunjukkan langkah awal (bukan angka contoh).', 'Pendapatan = pesanan yang sudah diserahkan. Uang masuk hari ini = pembayaran diterima (termasuk DP). Pembayaran tertunda = sisa bayar semua pesanan.'],
  },
  pesanan: {
    title: 'Pesanan', step: 46,
    steps: ['Permintaan masuk (dari halaman bisnis): ketuk → periksa → Konfirmasi atau Tolak, lalu WA pelanggan (Langkah 66).', 'Kuliner: pilih Makan di tempat (ketuk meja) / Bungkus / Diantar, ketuk menu & jumlah, catatan (pedas, tanpa bawang), lalu Simpan (Langkah 67).', '+ Pesanan baru: pilih/isi pelanggan, ketuk layanan, isi berat/jumlah, antar-jemput (wilayah, alamat, tanggal & jam), diskon, janji selesai, DP, lalu Simpan.', 'Pesanan dijemput: tekan Sudah dijemput dulu, baru bisa diproses. Pesanan diantar: Berangkat antar → Sudah diantar.', 'Ketuk pesanan › tombol → [tahap berikutnya] setiap pindah tahap; setelah tahap terakhir → Siap.', 'Siap: WA: sudah siap, + Bayar, lalu Sudah diambil / Sudah diantar.', 'Nota: cetak atau kirim lewat WhatsApp. Catat keluhan bila ada (bisa cuci ulang tanpa biaya).', 'Foto barang saat diterima (noda, kerusakan): 📎 Lampiran di detail pesanan — petugas proses juga bisa menambah (Langkah 63).'],
    warn: ['Harga dihitung server dari Layanan & tahap; minimal (mis. 3 kg) berlaku otomatis.', 'Mundur tahap wajib alasan. Batalkan pesanan & batal pembayaran wajib alasan dan bisa perlu persetujuan pemilik.', 'Petugas proses hanya memindahkan tahap & mencatat keluhan; tidak melihat uang.'],
  },
  layanan: {
    title: 'Layanan & tahap', step: 45,
    steps: ['Kuliner: menu ini bernama Menu & tahap — harga per porsi/gelas/cup, tahap dapur Dimasak → Siap saji, dan Jumlah meja untuk QR per meja (Langkah 67).', 'Ketuk layanan untuk mengubah harga per kg/pcs, minimal, lama pengerjaan (jam), deskripsi, persyaratan, info tambahan, dan Tersedia/Tidak tersedia sementara.', '+ Layanan untuk menambah (kelompok: Kiloan, Satuan, dll.).', 'Tahap proses: ubah nama, urutkan ↑ ↓, nonaktifkan, + Tahap, lalu Simpan tahap.', 'Ketuk layanan/menu → + Foto: foto tampil di halaman bisnis (Langkah 71).'],
    warn: ['Jumlah layanan/menu aktif mengikuti paket (Gratis/Dasar 100, Bisnis 1.000, Pro 5.000). Saat penuh, tandai Tidak tersedia yang tidak dipakai atau naik paket.', 'Harga baru hanya berlaku untuk pesanan berikutnya; pesanan lama tetap harga lamanya.', 'Tahap yang sedang dipakai pesanan tidak bisa dinonaktifkan.'],
  },
  antar: {
    title: 'Antar jemput', step: 65,
    steps: ['Tab Jemput: cucian yang harus dijemput (Terlewat / Hari ini / Besok / Belum dijadwalkan). Peta, WA, Jadwal, lalu Sudah dijemput.', 'Tab Antar: pesanan siap diantar. Berangkat antar → Sudah diterima pelanggan (pesanan selesai).', 'Gagal jemput/antar: tekan Gagal, tulis alasan, jadwalkan ulang.', 'Pemilik: tab Wilayah & jadwal — + Wilayah (dengan biaya) dan + Jam (jemput/antar, kapasitas per hari).'],
    warn: ['Hanya wilayah di daftar yang bisa dipilih saat menerima pesanan.', 'Petugas proses hanya bisa menyerahkan pesanan yang sudah lunas; penagihan oleh kasir/pemilik.', 'Pesanan tidak otomatis lunas — pembayaran dicatat terpisah.'],
  },
  meja: {
    title: 'Meja & reservasi', step: 69,
    steps: ['Tab Meja: ketuk meja → lihat pesanan, + Pesanan untuk meja ini.', 'Menagih: Bayar semua, Bagi rata (isi jumlah orang → Catat bayar 1 orang, ulangi), atau Per item (centang makanan satu orang → bayar).', 'Tamu selesai: Tutup meja — pesanan yang Siap diserahkan.', 'Tab Reservasi: + Reservasi, atau konfirmasi Permintaan dari halaman bisnis (pilih meja → Konfirmasi → WA). Saat tiba: Tamu datang.'],
    warn: ['Meja yang sudah dipesan di jam bertumpuk ditolak otomatis.', 'Tutup meja dengan sisa tagihan = piutang.', 'Reservasi tanpa uang muka (DP dalam rencana).'],
  },
  dapur: {
    title: 'Dapur', step: 67,
    steps: ['Pesanan terlama di atas; merah bila lebih dari 30 menit. Judul kartu: nomor meja, Bungkus, atau Antar.', 'Baca jumlah, menu, dan catatan (↳ pedas, tanpa bawang…).', 'Tekan tombol besar → [tahap berikutnya]; setelah tahap terakhir → Siap.', 'Pesanan siap diserahkan & dibayar oleh kasir di menu Pesanan.'],
    warn: ['Layar memuat ulang sendiri tiap 20 detik; tekan Muat ulang bila perlu.', 'Pesanan dari QR meja tampil di atas sebagai pemberitahuan dan baru masuk antrean setelah kasir Konfirmasi.', 'Petugas dapur tidak melihat uang.'],
  },
  'laporan-jasa': {
    title: 'Laporan jasa', step: 50,
    steps: ['Pilih bulan dengan ‹ ›.', 'Pendapatan = pesanan yang diserahkan bulan itu. Laba (perkiraan) = pendapatan − pemakaian bahan − biaya operasional.', 'Per layanan (batang + persen), pelanggan teratas, grafik harian (ketuk kolom; tabel di Lihat tabel harian), ketepatan waktu, dan keluhan.', 'Paket Standar: Unduh Excel.'],
    warn: ['Ekspor Excel & cetak PDF dihitung per bulan sesuai paket (Dasar 10, Bisnis 100, Pro 500); sisa kuota tampil di dekat tombol. Bisnis yang ditutup tetap bisa mengunduh tanpa dihitung.', 'Uang masuk bisa berbeda dengan pendapatan: DP dicatat sebagai uang muka sampai pesanan diserahkan.', 'Biaya bahan hanya terhitung bila pemakaian dicatat di Bahan & stok.'],
  },
  bahan: {
    title: 'Bahan & stok', step: 50,
    steps: ['+ Tambah bahan: nama (deterjen, pewangi, plastik), satuan, harga modal, stok sekarang.', 'Beli bahan lewat Belanja agar stok & harga modal ikut diperbarui.', 'Tombol Stok › Pemakaian bahan saat bahan dipakai; Stok opname (hitung ulang) untuk mencocokkan dengan fisik.'],
    warn: ['Isi harga modal agar biaya bahan di laporan benar.', 'Isi stok minimum agar diingatkan sebelum habis.'],
  },
  'kas-jasa': {
    title: 'Kas', step: 50,
    steps: ['Pertama kali: + Uang masuk/keluar lain › Setor modal sebesar uang di laci (dan bank).', '+ Biaya untuk listrik, gas, gaji, ganti rugi pelanggan, dll. Foto nota lewat 📎 di baris biaya (Langkah 63).', 'Tab Utang supplier: Bayar saat melunasi belanja utang.'],
    warn: ['Pembayaran pesanan otomatis masuk saldo kas/bank. Sisa bayar pelanggan ada di Pesanan, bukan di sini.', 'Prive tidak mengurangi laba, tetapi mengurangi kas.'],
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
    warn: ['Permintaan hapus akun ada di atas daftar: Diproses, Selesai (boleh dengan catatan), atau Tolak (wajib alasan). Hanya Super Admin yang bisa memutuskan. Data yang wajib disimpan menurut retensi tidak dihapus otomatis.', 'Skor kesehatan versi awal: penggunaan laporan belum dilacak.', 'Data penghuni dan pelanggan toko tidak ditampilkan ke admin.'],
  },
  'admin-langganan': {
    title: 'Langganan & pembayaran', admin: true,
    steps: ['Tab Menunggu: cocokkan nominal & nomor invoice dengan mutasi rekening/QRIS, lalu Uang masuk, aktifkan — atau Tolak. Bisa oleh Super Admin dan staf Keuangan. Tiap tagihan punya ID transaksi (TRX-…).', 'Bagian Pembayaran perlu dicocokkan (di atas daftar): pembayaran Lynk.id yang belum cocok otomatis. Pilih tagihan menunggu dengan nominal sama, isi alasan (minimal 5 huruf), lalu Cocokkan — atau Abaikan bila bukan pembayaran langganan.', 'Tab Riwayat untuk semua pembayaran; tab Langganan aktif diurutkan dari yang paling dulu berakhir.', 'Tab Perubahan paket: siapa mengubah paket siapa, sebelum → sesudah, dan alasannya.'],
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
  'admin-kategori': {
    title: 'Kategori bisnis',
    steps: ['Kategori & subkategori tampil di pendaftaran ("Apa jenis bisnis Anda?").', 'Tiap kategori memakai mesin (Properti, Retail, Jasa, Business Builder) dan template yang sudah ada.', 'Ubah nama/ikon/catatan, sembunyikan, atau tambah subkategori; kategori baru tidak butuh perubahan kode.'],
    warn: ['Hanya Super Admin yang bisa mengubah; semua perubahan tercatat di Catatan audit.', 'Jangan menjanjikan mesin yang belum ada — pakai catatan "dalam rencana".'],
  },
  'admin-paket': {
    title: 'Paket & harga', admin: true,
    steps: ['Setiap paket: harga per bulan per bisnis, harga normal (dicoret), batas (kamar terisi, karyawan, ruang foto), dan fitur.', 'Paket jangka panjang (mis. Pro Tahunan): harga total sekali bayar + harga pembanding; ubah lewat Paket jangka panjang, alasan wajib.', 'Ubah harga / fitur = versi baru dengan alasan wajib; riwayat versi tersimpan dan tercatat di audit.', 'Pilih aturan pelanggan lama: ikut harga baru atau tetap harga lama saat perpanjang.', '+ Paket baru: dibuat tersembunyi dengan harga Rp 0; atur harga & fitur, lalu tampilkan.', 'Pengaturan: masa tenggang, lama masa coba (hari), paket selama masa coba, dan tanggal akhir promosi (kosong = berlaku sampai Anda ubah).'],
    warn: ['Fitur & batas versi baru langsung berlaku untuk semua bisnis di paket itu. Harga baru hanya untuk pembelian berikutnya.', 'Hanya Super Admin yang bisa mengubah; staf lain hanya melihat.'],
  },
  'admin-pertumbuhan': {
    title: 'Pertumbuhan', admin: true,
    steps: ['Pilih periode 7, 30, atau 90 hari. Semua angka dihitung dari data nyata (pemilik baru, bisnis aktif, masa coba, pembayaran, perpanjangan).', 'Konversi: masa coba → berbayar, bisnis berbayar, dan pendapatan yang disetujui. Upgrade: Dasar → Bisnis, Bisnis → Pro, dan Pro bulanan → tahunan.', 'Kinerja pemicu: tiap penawaran dihitung tampil, diklik, ditolak, checkout, dan bayar. Ringkasan menyebut yang paling efektif dan yang paling sering ditolak.'],
    warn: ['Kunjungan = jumlah buka halaman publik per hari (beranda, panduan, tentang, masuk, daftar bisnis), bukan orang unik, tanpa data pribadi; data mulai terkumpul sejak fitur ini aktif. Konversi pendaftaran = pemilik baru ÷ kunjungan beranda.', 'Perpanjangan & churn dihitung dari riwayat aktivasi: masa bayar yang jatuh tempo dalam periode dianggap diperpanjang bila ada pembayaran baru paling lambat 3 hari setelahnya. Tidak aktif = pelanggan aktif tanpa transaksi 14 hari.', 'Alasan berhenti hanya ada bila pemilik memilih mengisinya (opsional).', 'MRR dan ARR adalah perkiraan dari harga paket per bulan, bukan laporan keuangan. Pembayaran tetap dicatat di Langganan & pembayaran.'],
  },
  'admin-kampanye': {
    title: 'Kampanye', admin: true,
    steps: ['Setiap penawaran menyebut kapan ditawarkan, paket asal → tujuan, pesan, tombol, frekuensi, dan prioritas.', 'Ketuk Ubah untuk mengganti pesan, paket tujuan, frekuensi, atau periode. Lihat Pratinjau desktop dan mobile sebelum Simpan kampanye.', 'Aktifkan atau Nonaktifkan untuk menghentikan penawaran tanpa menghapusnya. + Kampanye baru membuat penawaran baru.'],
    warn: ['Harga tidak diatur di sini; harga mengikuti Paket & harga. Penawaran hanya tampil bila pemilik memenuhi syarat dan frekuensinya belum habis.', 'Hanya Super Admin yang bisa mengubah. Setiap perubahan tercatat di Catatan audit.'],
  },
  'admin-sistem': {
    title: 'Status sistem', admin: true,
    steps: ['Database, jadwal otomatis 07.00 WIB, dan jumlah email hari ini.', 'Daftar layanan hanya menunjukkan Terpasang/Belum — nilai kunci rahasia tidak pernah ditampilkan.', 'Riwayat jadwal: ✓/✗ untuk pengingat, pendampingan, dan ringkasan.'],
    warn: ['Bila jadwal "Periksa", buka Vercel › Logs untuk detail galat.'],
  },
};
